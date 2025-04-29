# These flags are needed in order for PyAudio to interface with portaudio
# You can install portaudio with `brew install portaudio`
export CFLAGS="-I/opt/homebrew/include"
export LDFLAGS="-L/opt/homebrew/lib"
pip install -r requirements.txt