#!/usr/bin/env node

/**
 * reveal2mp4 - Convert Reveal.js slideshow with audio to MP4
 * 
 * Usage: ./reveal2mp4.js <html-file> [output.mp4]
 */

const puppeteer = require('puppeteer');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
if (argv.length < 1 || argv.includes('--help') || argv.includes('-h')) {
  console.log('Reveal.js to MP4 Converter');
  console.log('Usage: reveal2mp4 <html-file> [output.mp4]');
  console.log('\nRequirements:');
  console.log('  - Node.js, Puppeteer');
  console.log('  - FFmpeg and FFprobe installed in PATH');
  process.exit(0);
}

const htmlFile = path.resolve(argv[0]);
if (!fs.existsSync(htmlFile)) {
    console.error(`Error: File not found: ${htmlFile}`);
    process.exit(1);
}

const outputFile = argv[1] || htmlFile.replace(/\.html$/, '.mp4');
if (path.resolve(outputFile) === htmlFile) {
    console.error('Error: Output file must be different from input file.');
    process.exit(1);
}

const tmpDir = path.join(process.cwd(), '.tmp_reveal2mp4');

// Ensure tmp dir is clean
if (fs.existsSync(tmpDir)) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
fs.mkdirSync(tmpDir);

async function getAudioDuration(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    // Try standard duration first
    const out = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
    let d = out.toString().trim();
    
    // If N/A, read last packet timestamp (common for browser-recorded webm)
    if (d === 'N/A' || d === '') {
        const out2 = execSync(`ffprobe -v error -select_streams a:0 -show_entries packet=pts_time -of default=noprint_wrappers=1:nokey=1 "${filePath}" | tail -1`);
        d = out2.toString().trim();
    }
    const val = parseFloat(d);
    return isNaN(val) ? null : val;
  } catch (e) {
    return null;
  }
}

async function run() {
  let browser;
  try {
    console.log('>>> Initializing Browser...');
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    console.log(`>>> Loading Slideshow: ${htmlFile}...`);
    await page.goto(`file://${htmlFile}`, { waitUntil: 'networkidle2' });

    // Wait for Reveal to be ready
    await page.waitForFunction(() => typeof Reveal !== 'undefined' && Reveal.isReady(), { timeout: 10000 });

    // Inject CSS to disable transitions and animations for instant rendering
    await page.addStyleTag({
      content: `
        * {
          -webkit-transition: none !important;
          -moz-transition: none !important;
          -ms-transition: none !important;
          -o-transition: none !important;
          transition: none !important;
          -webkit-animation: none !important;
          -moz-animation: none !important;
          -ms-animation: none !important;
          -o-animation: none !important;
          animation: none !important;
        }
      `
    });

    // Get Audio Config from Reveal
    const audioConfig = await page.evaluate(() => {
      const config = Reveal.getConfig().audio || {};
      return {
        prefix: config.prefix || './audio/',
        suffix: config.suffix || '.webm',
        defaultDuration: config.defaultDuration || 5
      };
    });

    const states = [];
    let hasMore = true;

    // Navigate to start
    console.log('>>> Extracting Slides and Fragments...');
    await page.evaluate(() => Reveal.slide(0, 0, -1));

    let step = 0;
    while (hasMore) {
      // Small safety delay to ensure DOM is settled
      await new Promise(r => setTimeout(r, 100));

      const indices = await page.evaluate(() => Reveal.getIndices());
      const h = indices.h;
      const v = indices.v;
      const f = (indices.f === undefined || indices.f === -1) ? null : indices.f;

      const screenshotPath = path.join(tmpDir, `step_${step.toString().padStart(4, '0')}.png`);
      await page.screenshot({ path: screenshotPath });

      // Identify audio file
      let audioFileName = `${h}.${v}${f !== null ? '.' + f : ''}${audioConfig.suffix}`;
      let audioPath = path.join(path.dirname(htmlFile), audioConfig.prefix, audioFileName);
      
      let duration = await getAudioDuration(audioPath);
      if (!duration) {
        duration = audioConfig.defaultDuration;
        audioPath = null;
      }

      states.push({ screenshotPath, audioPath, duration, label: `${h}.${v}${f !== null ? '.' + f : ''}` });

      // Go to next state
      hasMore = await page.evaluate(() => {
        const currentIndices = Reveal.getIndices();
        Reveal.next();
        const nextIndices = Reveal.getIndices();
        return currentIndices.h !== nextIndices.h || currentIndices.v !== nextIndices.v || currentIndices.f !== nextIndices.f;
      });

      step++;
    }

    await browser.close();
    console.log(`>>> Captured ${states.length} states.`);

    // Encoding segments
    console.log('>>> Encoding Video Segments...');
    const segments = [];
    for (let i = 0; i < states.length; i++) {
      const s = states[i];
      const segmentPath = path.join(tmpDir, `segment_${i.toString().padStart(4, '0')}.mp4`);
      
      process.stdout.write(`    [${i+1}/${states.length}] State ${s.label} (${s.duration.toFixed(2)}s)... `);
      
      let ffmpegCmd;
      if (s.audioPath) {
          ffmpegCmd = `ffmpeg -y -v error -loop 1 -i "${s.screenshotPath}" -i "${s.audioPath}" -c:v libx264 -t ${s.duration} -pix_fmt yuv420p -vf "scale=1920:1080" -c:a aac -b:a 192k "${segmentPath}"`;
      } else {
          ffmpegCmd = `ffmpeg -y -v error -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -loop 1 -i "${s.screenshotPath}" -c:v libx264 -t ${s.duration} -pix_fmt yuv420p -vf "scale=1920:1080" -c:a aac -shortest "${segmentPath}"`;
      }
      
      execSync(ffmpegCmd);
      console.log('Done.');
      segments.push(segmentPath);
    }

    // Final concatenation
    const concatFile = path.join(tmpDir, 'concat.txt');
    const concatContent = segments.map(s => `file '${path.basename(s)}'`).join('\n');
    fs.writeFileSync(concatFile, concatContent);

    console.log('>>> Concatenating Final Video...');
    // We run concat in the tmp directory to avoid path issues
    execSync(`ffmpeg -y -v error -f concat -safe 0 -i concat.txt -c copy "${path.resolve(outputFile)}"`, { cwd: tmpDir });

    console.log(`\n>>> Success! Video saved to: ${outputFile}`);
    
    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });

  } catch (err) {
    console.error('\n>>> Error occurred:', err.message);
    if (browser) await browser.close();
    process.exit(1);
  }
}

run();
