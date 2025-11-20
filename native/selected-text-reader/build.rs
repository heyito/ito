fn main() {
    #[cfg(target_os = "windows")]
    {
        let mut res = tauri_winres::WindowsResource::new();

        // Set all metadata
        res.set_manifest_file("selected-text-reader.manifest");
        res.set("FileDescription", "Selected Text Reader - Captures selected text for accessibility and productivity applications");
        res.set("ProductName", "Selected Text Reader - Accessibility Tool");
        res.set("CompanyName", "Demox Labs");
        res.set(
            "LegalCopyright",
            "Copyright © 2025 Demox Labs. All rights reserved.",
        );
        res.set("FileVersion", "0.1.0.0");
        res.set("ProductVersion", "0.1.0.0");
        res.set("InternalName", "selected-text-reader");
        res.set("OriginalFilename", "selected-text-reader.exe");
        res.set(
            "Comments",
            "Accessibility utility for selected text capture via command-line interface",
        );

        res.compile().unwrap();
    }
}
