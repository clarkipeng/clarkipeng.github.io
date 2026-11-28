// Checks every desk clip in public/desk-media/clips.json against the clip spec in AGENTS.md ("Desk clips").
// usage: node scripts/check-clips.mjs   (needs ffprobe; exits 1 and lists every violation)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const dir = 'public/desk-media';
const papers = new Set(['vp2', 'pdfr']); // paper figures keep their own size, frame rate and length
const errors = [];

for (const [key, entry] of Object.entries(JSON.parse(readFileSync(`${dir}/clips.json`, 'utf8')))) {
  for (const file of [entry.poster, entry.cover, ...entry.clips].filter(Boolean)) {
    if (!existsSync(`${dir}/${file}`)) errors.push(`${file}: missing`);
  }
  for (const clip of entry.clips) {
    const path = `${dir}/${clip}`;
    if (!existsSync(path)) continue;
    const { streams, format } = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path]));
    const v = streams.find((s) => s.codec_type === 'video');
    const [num, den] = v.r_frame_rate.split('/').map(Number);
    const fail = (what) => errors.push(`${clip}: ${what}`);
    if (streams.some((s) => s.codec_type === 'audio')) fail('has an audio track');
    if (v.codec_name !== 'h264' || v.profile !== 'High' || v.pix_fmt !== 'yuv420p') fail(`${v.codec_name} ${v.profile} ${v.pix_fmt}, not h264 High yuv420p`);
    const color = [v.color_range, v.color_space, v.color_primaries, v.color_transfer].join('/');
    if (color !== 'tv/bt709/bt709/bt709') fail(`color ${color}, not tv/bt709/bt709/bt709`);
    if (statSync(path).size > 2e6) fail(`${(statSync(path).size / 1e6).toFixed(2)} MB, over 2 MB`);
    if (papers.has(key)) continue;
    if (v.width !== 1200 || v.height !== 800) fail(`${v.width}x${v.height}, not 1200x800`);
    if (![30, 60].includes(num / den)) fail(`${v.r_frame_rate} fps, not 30 or 60`);
    if (format.duration < 5 || format.duration > 8) fail(`${Number(format.duration).toFixed(2)} s, not 5 to 8 s`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('desk clips match the spec');
