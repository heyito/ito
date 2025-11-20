fn main() {
    #[cfg(target_os = "windows")]
    {
        let mut res = tauri_winres::WindowsResource::new();

        // Set all metadata
        res.set_manifest_file("audio-recorder.manifest");
        res.set("FileDescription", "Audio Recording Utility - Captures audio input for accessibility and productivity applications");
        res.set("ProductName", "Audio Recorder - Accessibility Tool");
        res.set("CompanyName", "Demox Labs");
        res.set(
            "LegalCopyright",
            "Copyright © 2025 Demox Labs. All rights reserved.",
        );
        res.set("FileVersion", "0.1.0.0");
        res.set("ProductVersion", "0.1.0.0");
        res.set("InternalName", "audio-recorder");
        res.set("OriginalFilename", "audio-recorder.exe");
        res.set(
            "Comments",
            "Accessibility utility for audio recording via command-line interface",
        );

        res.compile().unwrap();
    }
}
