import logging
import threading
from typing import Optional, Tuple, Set, Any

import sounddevice as sd

logger = logging.getLogger(__name__)

class DeviceChangeListener:
    def on_device_changed(self, new_device_index: Optional[int]):
        raise NotImplementedError

class AudioDeviceManager:
    _instance = None
    _lock = threading.Lock()

    def __init__(self):
        if AudioDeviceManager._instance is not None:
            raise Exception("Singleton cannot be instantiated more than once! Use instance() method.")
        
        self._current_device: Optional[int] = None
        self._current_device_name: Optional[str] = None
        self._device_lock = threading.RLock()  # RLock for re-entrant device operations
        self._listeners: Set[DeviceChangeListener] = set()
        
        logger.info("Initializing AudioDeviceManager...")
        self._initialize_current_device()
        logger.info(f"AudioDeviceManager initialized. Device: {self._current_device_name or 'None'} (Index: {self._current_device})")

    @classmethod
    def instance(cls) -> 'AudioDeviceManager':
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def _get_device_name_by_index(self, device_index: int) -> str:
        try:
            device_info = sd.query_devices(device_index)
            return device_info.get('name', f"Unknown Device {device_index}")
        except Exception:
            # Fallback if query_devices fails for a specific index (e.g., device just disconnected)
            return f"Unknown Device {device_index}"

    def _notify_listeners_about_device_change(self, new_device_index: Optional[int]):
        logger.info(f"Notifying {len(self._listeners)} listeners about device change to index: {new_device_index}")
        for listener in list(self._listeners):
            try:
                listener.on_device_changed(new_device_index)
            except Exception as e:
                logger.error(f"Error notifying listener {listener} of device change: {e}", exc_info=True)

    def _select_initial_input_device(self) -> Optional[Tuple[int, str]]:
        try:
            default_input_idx = sd.default.device[0] 
            if default_input_idx != -1: # -1 usually means no device
                is_valid, _ = self.verify_device_is_suitable_input(default_input_idx)
                if is_valid:
                    name = self._get_device_name_by_index(default_input_idx)
                    logger.info(f"Selected default audio input for init: {name} (Index: {default_input_idx})")
                    return default_input_idx, name
        except Exception as e:
            logger.warning(f"Could not query or use default input device during init: {e}")

        logger.info("Default input device not found or unsuitable. Scanning for alternatives...")
        try:
            devices = sd.query_devices()
            for i, device_info in enumerate(devices):
                if device_info.get('max_input_channels', 0) > 0:
                    is_valid, _ = self.verify_device_is_suitable_input(i)
                    if is_valid:
                        name = device_info.get('name', f"Unknown Device {i}")
                        logger.info(f"Selected first available audio input by scan: {name} (Index: {i})")
                        return i, name
        except Exception as e:
            logger.error(f"Error scanning for audio devices during init: {e}", exc_info=True)
        
        logger.error("No suitable input audio device found during initialization.")
        return None

    def _initialize_current_device(self):
        # This method is called only once during __init__
        # No lock needed here as __init__ is protected by the singleton's class lock.
        # However, operations it calls (_get_device_name_by_index, verify_device_is_suitable_input) are thread-safe.
        selected_device_info = self._select_initial_input_device()
        if selected_device_info:
            self._current_device, self._current_device_name = selected_device_info
        else:
            self._current_device = None
            self._current_device_name = None

    def get_current_device_index(self) -> Optional[int]:
        with self._device_lock:
            return self._current_device

    def get_current_device_name(self) -> Optional[str]:
        with self._device_lock:
            return self._current_device_name

    def verify_device_is_suitable_input(self, device_index: int) -> Tuple[bool, str]:
        try:
            device_info = sd.query_devices(device_index)
            name = device_info.get('name', 'N/A')
            if device_info.get('max_input_channels', 0) <= 0:
                msg = f"Device {name} (Index {device_index}) does not support input."
                logger.debug(msg)
                return False, msg
            logger.debug(f"Device {name} (Index {device_index}) verified as suitable input.")
            return True, ""
        except sd.PortAudioError as pae:
            msg = f"Device index {device_index} unavailable or invalid (PortAudioError): {pae}"
            logger.debug(msg)
            return False, msg
        except ValueError as ve:
            msg = f"Device index {device_index} is invalid (ValueError): {ve}"
            logger.debug(msg)
            return False, msg
        except Exception as e:
            msg = f"Unexpected error verifying device index {device_index}: {e}"
            logger.warning(msg, exc_info=True)
            return False, str(e)

    def update_current_device(self, new_device_index: Optional[int]) -> bool:
        with self._device_lock:
            logger.info(f"Attempting to update device to index: {new_device_index} (Current: {self._current_device})")

            current_actual_device = self._current_device
            current_actual_name = self._current_device_name

            if current_actual_device == new_device_index:
                if new_device_index is not None:
                    is_valid, _ = self.verify_device_is_suitable_input(new_device_index)
                    if is_valid:
                        refreshed_name = self._get_device_name_by_index(new_device_index)
                        if self._current_device_name != refreshed_name:
                            logger.info(f"Device {new_device_index} re-confirmed, name updated: {refreshed_name}")
                            self._current_device_name = refreshed_name
                            self._notify_listeners_about_device_change(new_device_index)
                        else:
                            logger.info(f"Device {new_device_index} is already current and valid. No change.")
                        return True
                    else:
                        logger.warning(f"Current device {new_device_index} ({self._current_device_name}) became invalid. Update failed.")
                        return False
                else:
                    logger.info("Device is already None. No change needed.")
                    return True

            if new_device_index is None:
                if self._current_device is not None:
                    logger.info(f"Clearing audio input device (was {self._current_device_name}).")
                    self._current_device = None
                    self._current_device_name = None
                    self._notify_listeners_about_device_change(None)
                else:
                    logger.info("Requested to clear device, but it was already None.")
                return True

            is_valid, error_msg = self.verify_device_is_suitable_input(new_device_index)
            if not is_valid:
                name_for_log = self._get_device_name_by_index(new_device_index)
                logger.error(f"Cannot update to device {name_for_log} (Index: {new_device_index}): {error_msg}")
                return False

            new_name = self._get_device_name_by_index(new_device_index)
            log_msg_prefix = f"Switched audio input from {current_actual_name} (Index: {current_actual_device})" \
                if current_actual_device is not None else "Set audio input"
            logger.info(f"{log_msg_prefix} to {new_name} (Index: {new_device_index}).")
            
            self._current_device = new_device_index
            self._current_device_name = new_name
            self._notify_listeners_about_device_change(self._current_device)
            return True

    def _find_alternative_device_for_recovery(self, excluded_indices: Set[Optional[int]]) -> Optional[int]:
        try:
            default_input_idx = sd.default.device[0]
            if default_input_idx != -1 and default_input_idx not in excluded_indices:
                is_valid, _ = self.verify_device_is_suitable_input(default_input_idx)
                if is_valid:
                    logger.info(f"Recovery: Using system default device {self._get_device_name_by_index(default_input_idx)} (Index: {default_input_idx}).")
                    return default_input_idx
        except Exception as e:
            logger.warning(f"Recovery: Error checking default device: {e}")

        logger.info("Recovery: Scanning all devices for a suitable alternative.")
        try:
            devices = sd.query_devices()
            for i, device_info in enumerate(devices):
                if i not in excluded_indices and device_info.get('max_input_channels', 0) > 0:
                    is_valid, _ = self.verify_device_is_suitable_input(i)
                    if is_valid:
                        logger.info(f"Recovery: Found alternative device by scan: {device_info.get('name')} (Index: {i}).")
                        return i
        except Exception as e:
            logger.error(f"Recovery: Error scanning devices: {e}", exc_info=True)
        
        return None

    def attempt_to_recover_device(self, failed_device_index: Optional[int] = None) -> bool:
        with self._device_lock:
            logger.info(f"Attempting device recovery. Failed index: {failed_device_index}, Current: {self._current_device_name} ({self._current_device})")

            if self._current_device is not None and self._current_device != failed_device_index:
                is_valid, _ = self.verify_device_is_suitable_input(self._current_device)
                if is_valid:
                    logger.info(f"Current device {self._current_device_name} is still valid and not the failed one. Recovery successful (no change).")
                    return True

            excluded_indices: Set[Optional[int]] = set()
            if failed_device_index is not None:
                excluded_indices.add(failed_device_index)
            if self._current_device is not None :
                 excluded_indices.add(self._current_device)


            alternative_device_index = self._find_alternative_device_for_recovery(excluded_indices)

            if alternative_device_index is not None:
                logger.info(f"Recovery: Attempting to switch to alternative device: {self._get_device_name_by_index(alternative_device_index)} ({alternative_device_index}).")
                if self.update_current_device(alternative_device_index):
                    logger.info("Recovery: Successfully switched to an alternative device.")
                    return True
                else:
                    logger.warning("Recovery: Failed to update to the chosen alternative device. It might have become invalid.")
            
            logger.warning("Recovery: No suitable alternative device found or update failed. Setting device to None.")
            if self._current_device is not None:
                self.update_current_device(None)
            
            logger.error("Recovery: Failed to find and set a working audio input device.")
            return False

    def register_listener(self, listener: DeviceChangeListener):
        with self._device_lock:
            logger.debug(f"Registering listener: {listener}")
            self._listeners.add(listener)

    def unregister_listener(self, listener: DeviceChangeListener):
        with self._device_lock:
            logger.debug(f"Unregistering listener: {listener}")
            self._listeners.discard(listener)

    def list_available_input_devices(self) -> list[Tuple[int, Any]]:
        try:
            devices = sd.query_devices()
            input_devices = [
                (i, device) for i, device in enumerate(devices)
                if device.get('max_input_channels', 0) > 0
            ]
            return input_devices
        except Exception as e:
            logger.error(f"Error listing audio devices: {e}", exc_info=True)
            return []