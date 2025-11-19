fn main() {
    #[cfg(target_os = "windows")]
    {
        let mut res = tauri_winres::WindowsResource::new();

        // Set all metadata
        res.set_manifest_file("active-application.manifest");
        res.set("FileDescription", "Active Window Monitor - Detects active application for accessibility and productivity applications");
        res.set("ProductName", "Active Application - Accessibility Tool");
        res.set("CompanyName", "Demox Labs");
        res.set(
            "LegalCopyright",
            "Copyright © 2025 Demox Labs. All rights reserved.",
        );
        res.set("FileVersion", "0.1.0.0");
        res.set("ProductVersion", "0.1.0.0");
        res.set("InternalName", "active-application");
        res.set("OriginalFilename", "active-application.exe");
        res.set(
            "Comments",
            "Accessibility utility for active window detection via command-line interface",
        );

        res.compile().unwrap();
    }
}
