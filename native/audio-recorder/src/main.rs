use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use std::io::{self, BufRead, Write};
use std::sync::{Arc, Mutex};
use std::thread;

// Correctly import all necessary traits and types.
use anyhow::{anyhow, Result};
use cpal::{Sample, SampleFormat, StreamConfig};
use rubato::{
    Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction,
};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "command")]
enum Command {
    #[serde(rename = "start")]
    Start { device_name: Option<String> },
    #[serde(rename = "stop")]
    Stop,
    #[serde(rename = "list-devices")]
    ListDevices,
}
#[derive(Serialize)]
struct DeviceList {
    #[serde(rename = "type")]
    response_type: String,
    devices: Vec<String>,
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
                if l.trim().is_empty() { continue; }
                if let Ok(command) = serde_json::from_str::<Command>(&l) {
                    cmd_tx.send(command).expect("Failed to send command to processor");
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
        self.list_devices();
        
        while let Ok(command) = self.cmd_rx.recv() {
            match command {
                Command::ListDevices => self.list_devices(),
                Command::Start { device_name } => self.start_recording(device_name),
                Command::Stop => self.stop_recording(),
            }
        }
    }

    fn list_devices(&mut self) {
        let host = cpal::default_host();
        let device_names: Vec<String> = match host.input_devices() {
            Ok(devices) => devices.map(|d| d.name().unwrap_or_else(|_| "Unknown Device".to_string())).collect(),
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
        
        let result = start_capture(device_name, Arc::clone(&self.stdout));

        match result {
            Ok(stream) => {
                if stream.play().is_ok() {
                    self.active_stream = Some(stream);
                }
            },
            Err(e) => eprintln!("[audio-recorder] Failed to start capture: {}", e),
        }
    }
    
    fn stop_recording(&mut self) {
        if let Some(stream) = self.active_stream.take() {
            let _ = stream.pause();
            drop(stream);
        }
    }
}

// --- FINAL VERSION BASED ON CPAL EXAMPLE ---
fn start_capture(device_name: Option<String>, stdout: Arc<Mutex<io::Stdout>>) -> Result<cpal::Stream> {
    const TARGET_SAMPLE_RATE: u32 = 16000;
    const TARGET_CHANNELS: usize = 1;

    let host = cpal::default_host();
    let device = if let Some(name) = device_name {
        if name.to_lowercase() == "default" || name.is_empty() { host.default_input_device() } 
        else { host.input_devices()?.find(|d| d.name().unwrap_or_default() == name) }
    } else {
        host.default_input_device()
    }.ok_or_else(|| anyhow!("Failed to find input device"))?;
    
    eprintln!("[audio-recorder] Using device: {}", device.name()?);

    // This logic is modeled on the cpal example to find a suitable config.
    let mut supported_configs_range = device.supported_input_configs()?;
    let config = supported_configs_range.find(|r| r.channels() > 0).ok_or_else(|| anyhow!("No supported input config found"))?.with_max_sample_rate();

    let input_sample_rate = config.sample_rate().0;
    let input_channels = config.channels() as usize;
    let input_sample_format = config.sample_format();
    
    eprintln!("[audio-recorder] Found input config: Rate: {}, Channels: {}, Format: {:?}", input_sample_rate, input_channels, input_sample_format);

    let mut resampler = if input_sample_rate != TARGET_SAMPLE_RATE {
        let params = SincInterpolationParameters {
            sinc_len: 256, f_cutoff: 0.95, interpolation: SincInterpolationType::Linear,
            oversampling_factor: 256, window: WindowFunction::BlackmanHarris2,
        };
        Some(SincFixedIn::<f32>::new(TARGET_SAMPLE_RATE as f64, input_sample_rate as f64, params, 1024, TARGET_CHANNELS)?)
    } else { None };

    let err_fn = |err| eprintln!("[audio-recorder] Stream error: {}", err);
    let stream_config: StreamConfig = config.into();

    fn process_and_write_audio(
        mono_f32: Vec<f32>, 
        resampler: &mut Option<SincFixedIn<f32>>, 
        stdout: &Arc<Mutex<io::Stdout>>
    ) {
        let resampled = if let Some(resampler) = resampler {
            resampler.process(&[mono_f32], None).unwrap().remove(0)
        } else { mono_f32 };

        let mut writer = stdout.lock().unwrap();
        let mut buffer = Vec::with_capacity(resampled.len() * 2);
        for s in resampled {
            buffer.extend_from_slice(&((s.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes());
        }
        let _ = write_framed_message(&mut *writer, MSG_TYPE_AUDIO, &buffer);
    }

    let stream = match input_sample_format {
        SampleFormat::F32 => device.build_input_stream(&stream_config, move |data: &[f32], _: &cpal::InputCallbackInfo| {
            let mono = if input_channels > 1 {
                data.chunks_exact(input_channels).map(|c| c.iter().sum::<f32>() / input_channels as f32).collect()
            } else { data.to_vec() };
            process_and_write_audio(mono, &mut resampler, &stdout);
        }, err_fn, None)?,

        SampleFormat::I16 => device.build_input_stream(&stream_config, move |data: &[i16], _: &cpal::InputCallbackInfo| {
            let data_f32: Vec<f32> = data.iter().map(|s| s.to_sample::<f32>()).collect();
            let mono = if input_channels > 1 {
                data_f32.chunks_exact(input_channels).map(|c| c.iter().sum::<f32>() / input_channels as f32).collect()
            } else { data_f32 };
            process_and_write_audio(mono, &mut resampler, &stdout);
        }, err_fn, None)?,

        SampleFormat::U16 => device.build_input_stream(&stream_config, move |data: &[u16], _: &cpal::InputCallbackInfo| {
            let data_f32: Vec<f32> = data.iter().map(|s| s.to_sample::<f32>()).collect();
            let mono = if input_channels > 1 {
                data_f32.chunks_exact(input_channels).map(|c| c.iter().sum::<f32>() / input_channels as f32).collect()
            } else { data_f32 };
            process_and_write_audio(mono, &mut resampler, &stdout);
        }, err_fn, None)?,
        
        format => return Err(anyhow!("Unsupported sample format {}", format))
    };

    Ok(stream)
}