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
        for l in stdin.lock().lines().map_while(Result::ok) {
            if l.trim().is_empty() {
                continue;
            }
            if let Ok(command) = serde_json::from_str::<Command>(&l) {
                cmd_tx
                    .send(command)
                    .expect("Failed to send command to processor");
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
                // On Windows, prefer WASAPI directly for best performance (10-30ms latency vs
                // DirectSound's 50-80ms)
                match cpal::host_from_id(cpal::platform::HostId::Wasapi) {
                    Ok(wasapi_host) => {
                        eprintln!("[audio-recorder] Using WASAPI host (optimal for Windows)");
                        wasapi_host
                    }
                    Err(e) => {
                        eprintln!(
                            "[audio-recorder] WASAPI unavailable ({}), falling back to default",
                            e
                        );
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
    // Select the dominant channel to avoid amplitude loss when one channel is
    // near-silent
    let frames = data.len() / num_channels;
    if frames == 0 {
        return Vec::new();
    }

    let mut energy_per_channel: Vec<f32> = vec![0.0; num_channels];
    for frame_idx in 0..frames {
        let base = frame_idx * num_channels;
        for c in 0..num_channels {
            let v = data[base + c].to_sample::<f32>();
            energy_per_channel[c] += v * v;
        }
    }
    let mut best_channel = 0usize;
    let mut best_energy = energy_per_channel[0];
    #[allow(clippy::needless_range_loop)]
    for c in 1..num_channels {
        if energy_per_channel[c] > best_energy {
            best_energy = energy_per_channel[c];
            best_channel = c;
        }
    }

    let mut out: Vec<f32> = Vec::with_capacity(frames);
    for frame_idx in 0..frames {
        let base = frame_idx * num_channels;
        out.push(data[base + best_channel].to_sample::<f32>());
    }
    out
}

fn writer_loop(
    audio_rx: crossbeam_channel::Receiver<Vec<f32>>,
    stdout: Arc<Mutex<io::Stdout>>,
    input_sample_rate: u32,
) {
    const TARGET_SAMPLE_RATE: u32 = 16000;
    const RESAMPLER_CHUNK_SIZE_DEFAULT: usize = 1024;
    const RESAMPLER_CHUNK_SIZE_FALLBACK: usize = 512;

    // Try FFT resampler with default size, then fallback chunk size
    let mut chosen_chunk_size: usize = RESAMPLER_CHUNK_SIZE_DEFAULT;
    let mut resampler_opt = if input_sample_rate != TARGET_SAMPLE_RATE {
        match FftFixedIn::new(
            input_sample_rate as usize,
            TARGET_SAMPLE_RATE as usize,
            chosen_chunk_size,
            1,
            1,
        ) {
            Ok(r) => Some(r),
            Err(e) => {
                eprintln!(
                    "[audio-recorder] CRITICAL: Failed to create resampler ({}), trying fallback chunk size",
                    e
                );
                chosen_chunk_size = RESAMPLER_CHUNK_SIZE_FALLBACK;
                match FftFixedIn::new(
                    input_sample_rate as usize,
                    TARGET_SAMPLE_RATE as usize,
                    chosen_chunk_size,
                    1,
                    1,
                ) {
                    Ok(r2) => Some(r2),
                    Err(e2) => {
                        eprintln!(
                            "[audio-recorder] CRITICAL: Fallback resampler creation failed ({}), using linear fallback",
                            e2
                        );
                        None
                    }
                }
            }
        }
    } else {
        None
    };

    let mut in_buffer: Vec<f32> = Vec::new();

    // Linear resampler fallback for mono when FFT resampler isn't available
    fn linear_resample_mono(input: &[f32], in_rate: u32, out_rate: u32) -> Vec<f32> {
        if input.is_empty() || in_rate == 0 || in_rate == out_rate {
            return input.to_vec();
        }
        let in_len = input.len();
        let ratio = out_rate as f32 / in_rate as f32;
        let out_len = ((in_len as f32) * ratio).round().max(0.0) as usize;
        if out_len <= 1 {
            return Vec::new();
        }
        let step = in_rate as f32 / out_rate as f32;
        let mut out = Vec::with_capacity(out_len);
        let mut pos: f32 = 0.0;
        for _ in 0..out_len {
            let idx = pos.floor() as usize;
            if idx >= in_len - 1 {
                out.push(input[in_len - 1]);
            } else {
                let frac = pos - (idx as f32);
                let a = input[idx];
                let b = input[idx + 1];
                out.push(a + (b - a) * frac);
            }
            pos += step;
        }
        out
    }

    while let Ok(frame) = audio_rx.recv() {
        if let Some(resampler) = resampler_opt.as_mut() {
            in_buffer.extend_from_slice(&frame);
            while in_buffer.len() >= chosen_chunk_size {
                let chunk_to_process: Vec<f32> =
                    in_buffer.drain(..chosen_chunk_size).collect::<Vec<_>>();
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
        } else if input_sample_rate != TARGET_SAMPLE_RATE {
            let resampled = linear_resample_mono(&frame, input_sample_rate, TARGET_SAMPLE_RATE);
            if !resampled.is_empty() {
                write_audio_chunk(&resampled, &stdout);
            }
        } else {
            write_audio_chunk(&frame, &stdout);
        }
    }

    // Channel closed; flush any remaining buffered samples through resampler
    if let Some(mut resampler) = resampler_opt.take() {
        while !in_buffer.is_empty() {
            let take = if in_buffer.len() >= chosen_chunk_size {
                chosen_chunk_size
            } else {
                in_buffer.len()
            };
            let mut chunk = in_buffer.drain(..take).collect::<Vec<_>>();
            if chunk.len() < chosen_chunk_size {
                // zero-pad final chunk to meet resampler size
                chunk.resize(chosen_chunk_size, 0.0);
            }
            if let Ok(mut resampled) = resampler.process(&[chunk], None) {
                if !resampled.is_empty() {
                    write_audio_chunk(&resampled.remove(0), &stdout);
                }
            }
        }
    } else if !in_buffer.is_empty() {
        if input_sample_rate != TARGET_SAMPLE_RATE {
            let resampled = linear_resample_mono(&in_buffer, input_sample_rate, TARGET_SAMPLE_RATE);
            if !resampled.is_empty() {
                write_audio_chunk(&resampled, &stdout);
            }
        } else {
            write_audio_chunk(&in_buffer, &stdout);
        }
    }

    // Signal drain complete to the host via a JSON message
    let response = serde_json::json!({
        "type": "drain-complete"
    });
    if let Ok(json_string) = serde_json::to_string(&response) {
        let mut writer = stdout.lock().unwrap();
        let _ = write_framed_message(&mut *writer, MSG_TYPE_JSON, json_string.as_bytes());
    }
}

fn start_capture(
    device_name: Option<String>,
    stdout: Arc<Mutex<io::Stdout>>,
    host: Rc<cpal::Host>,
) -> Result<CaptureHandles> {
    const TARGET_SAMPLE_RATE: u32 = 16000;
    const QUEUE_CAPACITY: usize = 512;

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
            input_sample_rate,
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

    Ok(CaptureHandles {
        stream,
        audio_tx,
        writer_handle,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_downmix_to_mono_single_channel() {
        let mono_samples: Vec<f32> = vec![0.5, -0.5, 1.0, -1.0];
        let result = downmix_to_mono_vec(&mono_samples, 1);

        assert_eq!(result.len(), 4);
        assert_eq!(result, vec![0.5, -0.5, 1.0, -1.0]);
    }

    #[test]
    fn test_downmix_to_mono_stereo() {
        // Stereo: L,R,L,R pattern
        let stereo_samples: Vec<f32> = vec![0.8, 0.2, -0.6, -0.4];
        let result = downmix_to_mono_vec(&stereo_samples, 2);

        assert_eq!(result.len(), 2);
        assert_eq!(result[0], 0.8); // Left channel sample 1
        assert_eq!(result[1], -0.6); // Left channel sample 2
    }

    #[test]
    fn test_downmix_to_mono_quad() {
        // 4 channels: one frame with values [1.0, 0.5, 0.25, 0.25]
        let quad_samples: Vec<f32> = vec![1.0, 0.5, 0.25, 0.25]; // One frame
        let result = downmix_to_mono_vec(&quad_samples, 4);

        assert_eq!(result.len(), 1);
        assert_eq!(result[0], 1.0); // Channel 0 sample
    }

    #[test]
    fn test_downmix_partial_frame() {
        // 5 samples with 2 channels - last sample incomplete, should be ignored
        let samples: Vec<f32> = vec![0.8, 0.2, -0.6, -0.4, 1.0];
        let result = downmix_to_mono_vec(&samples, 2);

        assert_eq!(result.len(), 2); // Only 2 complete frames
        assert_eq!(result[0], 0.8); // Left channel sample 1
        assert_eq!(result[1], -0.6); // Left channel sample 2
    }

    #[test]
    fn test_write_framed_message_structure() {
        let mut buffer = Vec::new();
        let test_data = b"test";

        write_framed_message(&mut buffer, MSG_TYPE_JSON, test_data).unwrap();

        // Check structure: [msg_type(1)] + [length(4)] + [data(4)]
        assert_eq!(buffer.len(), 9);
        assert_eq!(buffer[0], MSG_TYPE_JSON);

        // Length bytes (little-endian u32 = 4)
        let length = u32::from_le_bytes([buffer[1], buffer[2], buffer[3], buffer[4]]);
        assert_eq!(length, 4);

        // Data
        assert_eq!(&buffer[5..9], test_data);
    }

    #[test]
    fn test_write_framed_message_audio_type() {
        let mut buffer = Vec::new();
        let audio_data = vec![0u8; 100];

        write_framed_message(&mut buffer, MSG_TYPE_AUDIO, &audio_data).unwrap();

        assert_eq!(buffer[0], MSG_TYPE_AUDIO);
        let length = u32::from_le_bytes([buffer[1], buffer[2], buffer[3], buffer[4]]);
        assert_eq!(length, 100);
    }
}
