# Reveal.js to MP4 Converter

I was tired of endless recording sessions using [OBS](https://github.com/obsproject/obs-studio) (great tool BTW) watching the revealjs slideshow with audio-playback just to turn it into an mp4-video.

So this is a (mostly vibe-coded using [gemini-cli](https://github.com/google-gemini/gemini-cli)) terminal-based tool to render a Reveal.js slideshow with audio-playback (e.g. using [`audio-slideshow`](https://github.com/rajgoel/reveal.js-plugins/blob/master/audio-slideshow/README.md) or its Quarto-Plugin part [`audio-slideshow`](https://github.com/kapsner/audio-slideshow)) into a high-quality MP4 video. It automatically synchronizes slide and fragment transitions with their corresponding audio files.

## Features

- **Automated Capture**: Uses Puppeteer to navigate through slides and fragments.
- **Audio Synchronization**: Maps audio files to specific slides/fragments using Reveal.js conventions (`H.V.webm` or `H.V.F.webm`).
- **Precision Timing**: Extracts exact audio durations using `ffprobe` to ensure the video stays in sync.
- **Headless Rendering**: Works in the background without needing a visible browser window.
- **1080p Quality**: Captures and encodes at Full HD resolution.

## System Requirements

Before using the tool, ensure you have the following installed on your system:

### 1. Node.js & NPM
Download and install from [nodejs.org](https://nodejs.org/).

### 2. FFmpeg & FFprobe
These are required for audio processing and video encoding.
- **Ubuntu/Debian**: `sudo apt update && sudo apt install ffmpeg`
- **macOS (Homebrew)**: `brew install ffmpeg`
- **Windows**: Download binaries from [ffmpeg.org](https://ffmpeg.org/download.html) and add the `bin` folder to your system `PATH`.

### 3. Chromium/Chrome
Puppeteer requires a browser to render the slides. Usually, it downloads a local version during `npm install`, but you can also use your system's Chrome.

## Installation

1. Navigate to the tool directory:
   ```bash
   cd reveal2mp4-tool
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

Run the script directly using Node:

```bash
./reveal2mp4.js /path/to/slideshow.html [output_name.mp4]
```

## Compiling to an Executable

You can compile the tool into a standalone binary using `pkg`. Note that while this bundles the Node.js code, **FFmpeg and Chromium must still be installed on the host system**.

1. Install `pkg` globally:
   ```bash
   npm install -g pkg
   ```

2. Compile for your platform (example for Linux):
   ```bash
   pkg . --targets node18-linux-x64 --output reveal2mp4
   ```
   *(Replace `linux` with `macos` or `win` as needed).*

3. Run the binary:
   ```bash
   ./reveal2mp4 /path/to/slideshow.html
   ```

## Technical Specifications

The tool uses the following default settings for video and audio encoding:

| Parameter | Default Value | Description |
| :--- | :--- | :--- |
| **Video Resolution** | 1920 x 1080 (1080p) | Standard Full HD resolution. |
| **Frame Rate** | 25 FPS | Standard cinematic frame rate. |
| **Video Codec** | libx264 (H.264) | High compatibility across all devices and players. |
| **Pixel Format** | yuv420p | Required for broad hardware player compatibility. |
| **Audio Codec** | AAC | Advanced Audio Coding for high efficiency. |
| **Audio Bitrate** | 192 kb/s | High quality stereo audio. |
| **Sample Rate** | 44.1 kHz / 48.0 kHz | Standard audio sampling rates. |

## How it works

1. **Extraction**: The tool launches a headless browser, navigates to every slide/fragment, and takes a high-resolution screenshot.
2. **Analysis**: It identifies the associated audio file for each state and calculates its exact duration.
3. **Processing**: Individual video segments are created for each slide/fragment state.
4. **Final Assembly**: All segments are concatenated into a single MP4 file.
