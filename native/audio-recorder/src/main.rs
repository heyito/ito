use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use std::io::{self, BufRead, Write};
use std::rc::Rc;
use std::sync::{Arc, Mutex};
use std::thread;

use anyhow::{anyhow, Result};
use cpal::{Sample, SampleFormat, StreamConfig};
use dasp_sample::FromSample;
use rubato::{FftFixedIn, Resampler};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "command")]
enum Command {
    #[serde(rename = "start")]
    Start { device_name: Option<String> },
    #[serde(rename = "stop")]
    Stop,
    #[serde(rename = "list-devices")]
    ListDevices,
    #[serde(rename = "get-device-config")]
    GetDeviceConfig { device_name: Option<String> },
}
#[derive(Serialize)]
struct DeviceList {
    #[serde(rename = "type")]
    response_type: String,
    devices: Vec<String>,
}

#[derive(Serialize)]
struct AudioConfig {
    #[serde(rename = "type")]
    response_type: String,
    input_sample_rate: u32,
    output_sample_rate: u32,
    channels: u8,
}

const MSG_TYPE_JSON: u8 = 1;
const MSG_TYPE_AUDIO: u8 = 2;

fn write_framed_message(writer: &mut impl Write, msg_type: u8, data: &[u8]) -> io::Result<()> {
    let len = data.len() as u32;
    writer.write_all(&[msg_type])?;
    writer.write_all(&len.to_le_bytes())?;
    writer.write_all(data)?;
    writer.flush()
}

fn main() {
    let stdout = Arc::new(Mutex::new(io::stdout()));
    let (cmd_tx, cmd_rx) = crossbeam_channel::unbounded::<Command>();

    let mut command_processor = CommandProcessor::new(cmd_rx, Arc::clone(&stdout));

    thread::spawn(move || {
        let stdin = io::stdin();
        for line in stdin.lock().lines() {
            if let Ok(l) = line {
                if l.trim().is_empty() {
                    continue;
                }
                if let Ok(command) = serde_json::from_str::<Command>(&l) {
                    cmd_tx
                        .send(command)
                        .expect("Failed to send command to processor");
                }
            }
        }
    });

    command_processor.run();
}

struct CommandProcessor {
    cmd_rx: crossbeam_channel::Receiver<Command>,
    active_stream: Option<cpal::Stream>,
    stdout: Arc<Mutex<io::Stdout>>,
    cached_host: Option<Rc<cpal::Host>>,
    // Offloaded writer thread state
    audio_tx: Option<crossbeam_channel::Sender<Vec<f32>>>,
    writer_handle: Option<std::thread::JoinHandle<()>>,
}

impl CommandProcessor {
    fn new(cmd_rx: crossbeam_channel::Receiver<Command>, stdout: Arc<Mutex<io::Stdout>>) -> Self {
        CommandProcessor {
            cmd_rx,
            active_stream: None,
            stdout,
            cached_host: None,
            audio_tx: None,
            writer_handle: None,
        }
    }

    fn get_or_create_host(&mut self) -> Rc<cpal::Host> {
        if let Some(ref host) = self.cached_host {
            return host.clone();
        }

        let host = {
            #[cfg(target_os = "windows")]
            {
                // On Windows, prefer WASAPI directly for best performance (10-30ms latency vs DirectSound's 50-80ms)
                match cpal::host_from_id(cpal::platform::HostId::Wasapi) {
                    Ok(wasapi_host) => {
                        eprintln!("[audio-recorder] Using WASAPI host (optimal for Windows)");
                        wasapi_host
                    }
                    Err(e) => {
                        eprintln!("[audio-recorder] WASAPI unavailable ({}), falling back to default", e);
                        cpal::default_host()
                    }
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                cpal::default_host()
            }
        };

        let host_rc = Rc::new(host);
        self.cached_host = Some(host_rc.clone());
        host_rc
    }

    fn run(&mut self) {
        while let Ok(command) = self.cmd_rx.recv() {
            match command {
                Command::ListDevices => self.list_devices(),
                Command::Start { device_name } => self.start_recording(device_name),
                Command::Stop => self.stop_recording(),
                Command::GetDeviceConfig { device_name } => self.get_device_config(device_name),
            }
        }
    }

    fn list_devices(&mut self) {
        let host = self.get_or_create_host();
        let device_names: Vec<String> = match host.input_devices() {
            Ok(devices) => devices
                .map(|d| d.name().unwrap_or_else(|_| "Unknown Device".to_string()))
                .collect(),
            Err(_) => Vec::new(),
        };
        let response = DeviceList {
            response_type: "device-list".to_string(),
            devices: device_names,
        };
        if let Ok(json_string) = serde_json::to_string(&response) {
            let mut writer = self.stdout.lock().unwrap();
            let _ = write_framed_message(&mut *writer, MSG_TYPE_JSON, json_string.as_bytes());
        }
    }

    fn start_recording(&mut self, device_name: Option<String>) {
        self.stop_recording();

        let host = self.get_or_create_host();
        if let Ok(handles) = start_capture(device_name, Arc::clone(&self.stdout), host) {
            if handles.stream.play().is_ok() {
                self.audio_tx = Some(handles.audio_tx);
                self.writer_handle = Some(handles.writer_handle);
                self.active_stream = Some(handles.stream);
            }
        } else {
            eprintln!("[audio-recorder] CRITICAL: Failed to create audio stream");
        }
    }

    fn stop_recording(&mut self) {
        if let Some(stream) = self.active_stream.take() {
            let _ = stream.pause();
            drop(stream);
        }
        // Close audio channel to signal writer thread to exit
        if let Some(tx) = self.audio_tx.take() {
            drop(tx);
        }
        if let Some(handle) = self.writer_handle.take() {
            let _ = handle.join();
        }
    }

    fn get_device_config(&mut self, device_name: Option<String>) {
        const TARGET_SAMPLE_RATE: u32 = 16000;

        let host = self.get_or_create_host();

        let device = if let Some(name) = device_name {
            if name.to_lowercase() == "default" || name.is_empty() {
                host.default_input_device()
            } else {
                host.input_devices()
                    .ok()
                    .and_then(|mut it| it.find(|d| d.name().unwrap_or_default() == name))
            }
        } else {
            host.default_input_device()
        };

        let input_rate = device
            .and_then(|d| d.supported_input_configs().ok())
            .and_then(|mut cfgs| cfgs.find(|r| r.channels() > 0))
            .map(|cfg| cfg.with_max_sample_rate().sample_rate().0)
            .unwrap_or(TARGET_SAMPLE_RATE);

        let cfg = AudioConfig {
            response_type: "audio-config".to_string(),
            input_sample_rate: input_rate,
            output_sample_rate: TARGET_SAMPLE_RATE,
            channels: 1,
        };
        if let Ok(json_string) = serde_json::to_string(&cfg) {
            let mut writer = self.stdout.lock().unwrap();
            let _ = write_framed_message(&mut *writer, MSG_TYPE_JSON, json_string.as_bytes());
        }
    }
}

// --- MODIFIED: Function now accepts chunk_size as a parameter ---
fn process_and_write_data<T>(
    data: &[T],
    resampler: &mut Option<FftFixedIn<f32>>,
    buffer: &mut Vec<f32>,
    stdout: &Arc<Mutex<io::Stdout>>,
    chunk_size: usize,
    num_channels: usize,
) where
    T: Sample,
    f32: FromSample<T>,
{
    // Downmix to mono by averaging channels per frame to keep timebase correct
    let mono_samples: Vec<f32> = if num_channels <= 1 {
        data.iter().map(|s| s.to_sample::<f32>()).collect()
    } else {
        let mut out: Vec<f32> = Vec::with_capacity(data.len() / num_channels);
        let mut i = 0;
        while i + num_channels <= data.len() {
            let mut sum = 0.0f32;
            for c in 0..num_channels {
                sum += data[i + c].to_sample::<f32>();
            }
            out.push(sum / (num_channels as f32));
            i += num_channels;
        }
        out
    };

    if let Some(resampler_instance) = resampler {
        buffer.extend_from_slice(&mono_samples);

        while buffer.len() >= chunk_size {
            let chunk_to_process = buffer.drain(..chunk_size).collect::<Vec<_>>();

            match resampler_instance.process(&[chunk_to_process], None) {
                Ok(mut resampled) => {
                    if !resampled.is_empty() {
                        write_audio_chunk(&resampled.remove(0), stdout);
                    }
                }
                Err(e) => {
                    eprintln!("[audio-recorder] CRITICAL: Resampling failed: {}", e);
                }
            }
        }
    } else {
        write_audio_chunk(&mono_samples, stdout);
    }
}

fn write_audio_chunk(data: &[f32], stdout: &Arc<Mutex<io::Stdout>>) {
    let mut writer = stdout.lock().unwrap();
    let mut buffer = Vec::with_capacity(data.len() * 2);
    for s in data {
        buffer.extend_from_slice(&((s.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes());
    }

    if let Err(e) = write_framed_message(&mut *writer, MSG_TYPE_AUDIO, &buffer) {
        eprintln!(
            "[audio-recorder] CRITICAL: Failed to write to stdout: {}",
            e
        );
    }
}

struct CaptureHandles {
    stream: cpal::Stream,
    audio_tx: crossbeam_channel::Sender<Vec<f32>>,
    writer_handle: std::thread::JoinHandle<()>,
}

fn downmix_to_mono_vec<T>(data: &[T], num_channels: usize) -> Vec<f32>
where
    T: Sample,
    f32: FromSample<T>,
{
    if num_channels <= 1 {
        return data.iter().map(|s| s.to_sample::<f32>()).collect();
    }
    let mut out: Vec<f32> = Vec::with_capacity(data.len() / num_channels);
    let mut i = 0;
    while i + num_channels <= data.len() {
        let mut sum = 0.0f32;
        for c in 0..num_channels {
            sum += data[i + c].to_sample::<f32>();
        }
        out.push(sum / (num_channels as f32));
        i += num_channels;
    }
    out
}

fn writer_loop(
    audio_rx: crossbeam_channel::Receiver<Vec<f32>>,
    stdout: Arc<Mutex<io::Stdout>>,
    input_sample_rate: u32,
) {
    const TARGET_SAMPLE_RATE: u32 = 16000;
    const RESAMPLER_CHUNK_SIZE: usize = 2048; // larger chunk to reduce overhead

    let mut resampler_opt = if input_sample_rate != TARGET_SAMPLE_RATE {
        match FftFixedIn::new(
            input_sample_rate as usize,
            TARGET_SAMPLE_RATE as usize,
            RESAMPLER_CHUNK_SIZE,
            1,
            1,
        ) {
            Ok(r) => Some(r),
            Err(e) => {
                eprintln!("[audio-recorder] CRITICAL: Failed to create resampler: {}", e);
                None
            }
        }
    } else {
        None
    };

    let mut in_buffer: Vec<f32> = Vec::new();

    while let Ok(frame) = audio_rx.recv() {
        if let Some(resampler) = resampler_opt.as_mut() {
            in_buffer.extend_from_slice(&frame);
            while in_buffer.len() >= RESAMPLER_CHUNK_SIZE {
                let chunk_to_process: Vec<f32> = in_buffer
                    .drain(..RESAMPLER_CHUNK_SIZE)
                    .collect::<Vec<_>>();
                match resampler.process(&[chunk_to_process], None) {
                    Ok(mut resampled) => {
                        if !resampled.is_empty() {
                            write_audio_chunk(&resampled.remove(0), &stdout);
                        }
                    }
                    Err(e) => eprintln!(
                        "[audio-recorder] CRITICAL: Resampling failed in writer: {}",
                        e
                    ),
                }
            }
        } else {
            // direct write at input rate
            write_audio_chunk(&frame, &stdout);
        }
    }

    // Channel closed; flush any remaining buffered samples through resampler
    if let Some(mut resampler) = resampler_opt.take() {
        while !in_buffer.is_empty() {
            let take = if in_buffer.len() >= RESAMPLER_CHUNK_SIZE {
                RESAMPLER_CHUNK_SIZE
            } else {
                in_buffer.len()
            };
            let mut chunk = in_buffer.drain(..take).collect::<Vec<_>>();
            if chunk.len() < RESAMPLER_CHUNK_SIZE {
                // zero-pad final chunk to meet resampler size
                chunk.resize(RESAMPLER_CHUNK_SIZE, 0.0);
            }
            if let Ok(mut resampled) = resampler.process(&[chunk], None) {
                if !resampled.is_empty() {
                    write_audio_chunk(&resampled.remove(0), &stdout);
                }
            }
        }
    } else if !in_buffer.is_empty() {
        write_audio_chunk(&in_buffer, &stdout);
    }
}

fn start_capture(
    device_name: Option<String>,
    stdout: Arc<Mutex<io::Stdout>>,
    host: Rc<cpal::Host>,
) -> Result<CaptureHandles> {
    const TARGET_SAMPLE_RATE: u32 = 16000;
    const QUEUE_CAPACITY: usize = 64;

    let device = if let Some(name) = device_name {
        if name.to_lowercase() == "default" || name.is_empty() {
            host.default_input_device()
        } else {
            host.input_devices()?
                .find(|d| d.name().unwrap_or_default() == name)
        }
    } else {
        host.default_input_device()
    }
    .ok_or_else(|| anyhow!("[audio-recorder] Failed to find input device"))?;

    // Prefer the device's default input configuration instead of max rate to
    // better align with other apps (e.g., Zoom) and reduce host resampling.
    let default_config = device
        .default_input_config()
        .map_err(|_| anyhow!("[audio-recorder] No default input config found"))?;

    let input_sample_rate = default_config.sample_rate().0;
    let input_sample_format = default_config.sample_format();
    let channels_count: usize = default_config.channels() as usize;

    let err_fn = |err| eprintln!("[audio-recorder] Stream error: {}", err);
    let stream_config: StreamConfig = default_config.clone().into();

    // Writer thread and queue
    let (audio_tx, audio_rx) = crossbeam_channel::bounded::<Vec<f32>>(QUEUE_CAPACITY);
    let stdout_for_writer = Arc::clone(&stdout);
    let writer_handle = std::thread::spawn(move || {
        writer_loop(audio_rx, stdout_for_writer, input_sample_rate);
    });

    // Notify JS about input and effective output audio configuration
    {
        let cfg = AudioConfig {
            response_type: "audio-config".to_string(),
            input_sample_rate: input_sample_rate,
            output_sample_rate: TARGET_SAMPLE_RATE,
            channels: 1,
        };
        if let Ok(json_string) = serde_json::to_string(&cfg) {
            let mut writer = stdout.lock().unwrap();
            let _ = write_framed_message(&mut *writer, MSG_TYPE_JSON, json_string.as_bytes());
        }
    }

    let stream = match input_sample_format {
        SampleFormat::F32 => {
            let tx = audio_tx.clone();
            device.build_input_stream(
                &stream_config,
                move |data: &[f32], _| {
                    let mono = downmix_to_mono_vec(data, channels_count);
                    let _ = tx.try_send(mono);
                },
                err_fn,
                None,
            )?
        }
        SampleFormat::I16 => {
            let tx = audio_tx.clone();
            device.build_input_stream(
                &stream_config,
                move |data: &[i16], _| {
                    let mono = downmix_to_mono_vec(data, channels_count);
                    let _ = tx.try_send(mono);
                },
                err_fn,
                None,
            )?
        }
        SampleFormat::U16 => {
            let tx = audio_tx.clone();
            device.build_input_stream(
                &stream_config,
                move |data: &[u16], _| {
                    let mono = downmix_to_mono_vec(data, channels_count);
                    let _ = tx.try_send(mono);
                },
                err_fn,
                None,
            )?
        }
        SampleFormat::U8 => {
            let tx = audio_tx.clone();
            device.build_input_stream(
                &stream_config,
                move |data: &[u8], _| {
                    let mono = downmix_to_mono_vec(data, channels_count);
                    let _ = tx.try_send(mono);
                },
                err_fn,
                None,
            )?
        }
        SampleFormat::I32 => {
            let tx = audio_tx.clone();
            device.build_input_stream(
                &stream_config,
                move |data: &[i32], _| {
                    let mono = downmix_to_mono_vec(data, channels_count);
                    let _ = tx.try_send(mono);
                },
                err_fn,
                None,
            )?
        }
        SampleFormat::F64 => {
            let tx = audio_tx.clone();
            device.build_input_stream(
                &stream_config,
                move |data: &[f64], _| {
                    let mono = downmix_to_mono_vec(data, channels_count);
                    let _ = tx.try_send(mono);
                },
                err_fn,
                None,
            )?
        }
        SampleFormat::U32 => {
            let tx = audio_tx.clone();
            device.build_input_stream(
                &stream_config,
                move |data: &[u32], _| {
                    let mono = downmix_to_mono_vec(data, channels_count);
                    let _ = tx.try_send(mono);
                },
                err_fn,
                None,
            )?
        }
        format => {
            return Err(anyhow!(
                "[audio-recorder] Unsupported sample format {}",
                format
            ))
        }
    };

    Ok(CaptureHandles { stream, audio_tx, writer_handle })
}
