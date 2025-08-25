use clap::Parser;
use get_selected_text;
use serde::{Deserialize, Serialize};
use std::process;

#[derive(Parser)]
#[command(name = "selected-text-reader")]
#[command(about = "A cross-platform utility to get currently selected text")]
#[command(version = "0.1.0")]
struct Args {
    #[arg(
        long,
        help = "Output format: json or text",
        default_value = "json"
    )]
    format: String,

    #[arg(
        long,
        help = "Maximum length of text to return",
        default_value_t = 10000
    )]
    max_length: usize,
}

#[derive(Serialize, Deserialize)]
struct SelectedTextResult {
    success: bool,
    text: Option<String>,
    error: Option<String>,
    length: usize,
}

fn main() {
    let args = Args::parse();

    let result = match get_selected_text::get_selected_text() {
        Ok(selected_text) => {
            let text = if selected_text.is_empty() {
                None
            } else if selected_text.len() > args.max_length {
                Some(selected_text.chars().take(args.max_length).collect())
            } else {
                Some(selected_text)
            };

            SelectedTextResult {
                success: true,
                text: text.clone(),
                error: None,
                length: text.as_ref().map(|t| t.len()).unwrap_or(0),
            }
        }
        Err(e) => SelectedTextResult {
            success: false,
            text: None,
            error: Some(format!("Failed to get selected text: {}", e)),
            length: 0,
        },
    };

    match args.format.as_str() {
        "json" => {
            match serde_json::to_string(&result) {
                Ok(json) => println!("{}", json),
                Err(e) => {
                    eprintln!("Error serializing result to JSON: {}", e);
                    process::exit(1);
                }
            }
        }
        "text" => {
            if result.success {
                if let Some(text) = result.text {
                    print!("{}", text);
                }
            } else {
                if let Some(error) = result.error {
                    eprintln!("{}", error);
                    process::exit(1);
                }
            }
        }
        _ => {
            eprintln!("Error: Invalid format '{}'. Use 'json' or 'text'", args.format);
            process::exit(1);
        }
    }
}