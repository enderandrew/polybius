import librosa
import numpy as np
import json
import sys
import os

def analyze_audio(file_path):
    print(f"Analyzing {file_path}...")
    
    # Load the audio file
    y, sr = librosa.load(file_path)
    duration = librosa.get_duration(y=y, sr=sr)
    
    # 1. Get BPM and Beats
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    
    # 2. Get Bars (Assuming 4/4 time, taking every 4th beat)
    # Note: You can adjust the starting index if the downbeat is off
    bar_times = beat_times[::4] 
    
    # 3. Get Accents (Peaks in the onset envelope / energy)
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    peaks = librosa.util.peak_pick(onset_env, pre_max=3, post_max=3, pre_avg=3, post_avg=5, delta=0.5, wait=10)
    accent_times = librosa.frames_to_time(peaks, sr=sr)
    
    # Round everything to 3 decimal places to match your JSON format
    beat_times = [round(float(t), 3) for t in beat_times]
    bar_times = [round(float(t), 3) for t in bar_times]
    accent_times = [round(float(t), 3) for t in accent_times]
    
    # Construct the JSON object
    beat_data = {
        "bpm": round(float(tempo[0]), 3) if isinstance(tempo, np.ndarray) else round(float(tempo), 3),
        "duration": round(float(duration), 3),
        "beats": beat_times,
        "bars": bar_times,
        "accents": accent_times,
        "source": "auto",
        "analyzer": "librosa_energy"
    }
    
    # Save to JSON file
    out_file = os.path.splitext(file_path)[0] + '.beats.json'
    with open(out_file, 'w') as f:
        json.dump(beat_data, f, indent=2)
        
    print(f"Success! Saved beat data to {out_file}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python generate_beats.py <path_to_audio_file.ogg>")
    else:
        analyze_audio(sys.argv[1])