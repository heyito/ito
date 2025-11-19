fn main() {
    #[cfg(target_os = "windows")]
    {
        let mut res = tauri_winres::WindowsResource::new();

        // Set all metadata
        res.set_manifest_file("global-key-listener.manifest");
        res.set("FileDescription", "Keyboard Event Monitor - Global keyboard listener for accessibility and productivity applications");
        res.set("ProductName", "Global Key Listener - Accessibility Tool");
        res.set("CompanyName", "Demox Labs");
        res.set(
            "LegalCopyright",
            "Copyright © 2025 Demox Labs. All rights reserved.",
        );
        res.set("FileVersion", "0.1.0.0");
        res.set("ProductVersion", "0.1.0.0");
        res.set("InternalName", "global-key-listener");
        res.set("OriginalFilename", "global-key-listener.exe");
        res.set(
            "Comments",
            "Accessibility utility for global keyboard event monitoring via command-line interface",
        );

        res.compile().unwrap();
    }
}
