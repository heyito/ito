use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use std::io::{self, BufRead, Write};
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
}

impl CommandProcessor {
    fn new(cmd_rx: crossbeam_channel::Receiver<Command>, stdout: Arc<Mutex<io::Stdout>>) -> Self {
        CommandProcessor {
            cmd_rx,
            active_stream: None,
            stdout,
        }
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
        let host = cpal::default_host();
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

        if let Ok(stream) = start_capture(device_name, Arc::clone(&self.stdout)) {
            if stream.play().is_ok() {
                self.active_stream = Some(stream)
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
    }

    fn get_device_config(&mut self, device_name: Option<String>) {
        const TARGET_SAMPLE_RATE: u32 = 16000;

        let host = if cfg!(windows) {
            cpal::available_hosts()
                .into_iter()
                .find_map(|id| cpal::host_from_id(id).ok())
                .unwrap_or_else(|| cpal::default_host())
        } else {
            cpal::default_host()
        };

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

fn start_capture(
    device_name: Option<String>,
    stdout: Arc<Mutex<io::Stdout>>,
) -> Result<cpal::Stream> {
    const TARGET_SAMPLE_RATE: u32 = 16000;
    const RESAMPLER_CHUNK_SIZE: usize = 1024;

    // On Windows, try to get available hosts
    let host = if cfg!(windows) {
        // Try WASAPI first, then DirectSound, then default
        cpal::available_hosts()
            .into_iter()
            .find_map(|id| {
                eprintln!("[audio-recorder] Trying host: {:?}", id);
                cpal::host_from_id(id).ok()
            })
            .unwrap_or_else(|| {
                eprintln!("[audio-recorder] All hosts failed, using default");
                cpal::default_host()
            })
    } else {
        cpal::default_host()
    };
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

    let config = device
        .supported_input_configs()?
        .find(|r| r.channels() > 0)
        .ok_or_else(|| anyhow!("[audio-recorder] No supported input config found"))?
        .with_max_sample_rate();

    let input_sample_rate = config.sample_rate().0;
    let input_sample_format = config.sample_format();

    let mut resampler = if input_sample_rate != TARGET_SAMPLE_RATE {
        let resampler = FftFixedIn::new(
            input_sample_rate as usize,
            TARGET_SAMPLE_RATE as usize,
            RESAMPLER_CHUNK_SIZE,
            1,
            1,
        )?;
        Some(resampler)
    } else {
        None
    };

    let err_fn = |err| eprintln!("[audio-recorder] Stream error: {}", err);
    let stream_config: StreamConfig = config.clone().into();

    let mut audio_buffer: Vec<f32> = Vec::new();
    let channels_count: usize = config.channels() as usize;

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
        // --- MODIFIED: The callbacks now pass the known chunk size ---
        SampleFormat::F32 => device.build_input_stream(
            &stream_config,
            move |data: &[f32], _| {
                process_and_write_data(
                    data,
                    &mut resampler,
                    &mut audio_buffer,
                    &stdout,
                    RESAMPLER_CHUNK_SIZE,
                    channels_count,
                )
            },
            err_fn,
            None,
        )?,
        SampleFormat::I16 => device.build_input_stream(
            &stream_config,
            move |data: &[i16], _| {
                process_and_write_data(
                    data,
                    &mut resampler,
                    &mut audio_buffer,
                    &stdout,
                    RESAMPLER_CHUNK_SIZE,
                    channels_count,
                )
            },
            err_fn,
            None,
        )?,
        SampleFormat::U16 => device.build_input_stream(
            &stream_config,
            move |data: &[u16], _| {
                process_and_write_data(
                    data,
                    &mut resampler,
                    &mut audio_buffer,
                    &stdout,
                    RESAMPLER_CHUNK_SIZE,
                    channels_count,
                )
            },
            err_fn,
            None,
        )?,
        SampleFormat::U8 => device.build_input_stream(
            &stream_config,
            move |data: &[u8], _| {
                process_and_write_data(
                    data,
                    &mut resampler,
                    &mut audio_buffer,
                    &stdout,
                    RESAMPLER_CHUNK_SIZE,
                    channels_count,
                )
            },
            err_fn,
            None,
        )?,
        SampleFormat::I32 => device.build_input_stream(
            &stream_config,
            move |data: &[i32], _| {
                process_and_write_data(
                    data,
                    &mut resampler,
                    &mut audio_buffer,
                    &stdout,
                    RESAMPLER_CHUNK_SIZE,
                    channels_count,
                )
            },
            err_fn,
            None,
        )?,
        SampleFormat::F64 => device.build_input_stream(
            &stream_config,
            move |data: &[f64], _| {
                process_and_write_data(
                    data,
                    &mut resampler,
                    &mut audio_buffer,
                    &stdout,
                    RESAMPLER_CHUNK_SIZE,
                    channels_count,
                )
            },
            err_fn,
            None,
        )?,
        SampleFormat::U32 => device.build_input_stream(
            &stream_config,
            move |data: &[u32], _| {
                process_and_write_data(
                    data,
                    &mut resampler,
                    &mut audio_buffer,
                    &stdout,
                    RESAMPLER_CHUNK_SIZE,
                    channels_count,
                )
            },
            err_fn,
            None,
        )?,
        format => {
            return Err(anyhow!(
                "[audio-recorder] Unsupported sample format {}",
                format
            ))
        }
    };

    Ok(stream)
}
