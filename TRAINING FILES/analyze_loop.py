import torch
import torch.nn as nn
import librosa
import numpy as np

# 1. Redefine the exact model architecture so PyTorch knows how to load the weights
class AudioAnalyzerCNN(nn.Module):
    def __init__(self):
        super(AudioAnalyzerCNN, self).__init__()
        self.conv = nn.Conv2d(in_channels=1, out_channels=8, kernel_size=3)
        self.relu = nn.ReLU()
        self.pool = nn.MaxPool2d(kernel_size=2, stride=2)
        self.dense = nn.Linear(10584, 4)

    def forward(self, x):
        x = self.conv(x)
        x = self.relu(x)
        x = self.pool(x)
        x = torch.flatten(x, 1)
        x = self.dense(x)
        return x

# 2. Load the trained brain
# We explicitly use CPU here, which is exactly how it will run on Hugging Face later
device = torch.device("cpu") 
model = AudioAnalyzerCNN()
model.load_state_dict(torch.load("audio_analyzer_model.pt", map_location=device))
model.eval() # Sets the model to Inference Mode (turns off training mechanics)
print("Brain loaded successfully!\n")

# 3. The Sliding Window Function
def analyze_loop(file_path, stride=0.1, threshold=0.50):
    # Mapping our output nodes back to English
    classes = {0: 'Kick', 1: 'Snare', 2: 'Hat/Cymbal', 3: 'Tom'}
    sr = 22050
    duration = 1.0 # The CNN requires exactly 1 second
    
    print(f"Loading track: {file_path}")
    y_full, _ = librosa.load(file_path, sr=sr)
    total_duration = len(y_full) / sr
    print(f"Total track length: {total_duration:.2f} seconds\n")
    
    current_time = 0.0
    detections = []
    
    # Slide across the audio until the window hits the end
    # Slide across the audio until the window hits the end
    while current_time + duration <= total_duration:
        start_sample = int(current_time * sr)
        end_sample = start_sample + int(duration * sr)
        y_chunk = y_full[start_sample:end_sample]
        
        spectrogram = librosa.feature.melspectrogram(y=y_chunk, sr=sr, n_mels=128)
        spectrogram_db = librosa.power_to_db(spectrogram, ref=np.max)
        spectrogram_normalized = (spectrogram_db + 80) / 80
        
        tensor = torch.tensor(spectrogram_normalized, dtype=torch.float32).unsqueeze(0).unsqueeze(0)
        
        # Predict
        with torch.no_grad():
            outputs = model(tensor)
            probabilities = torch.softmax(outputs, dim=1)[0]
            
            kick_prob = probabilities[0].item() * 100
            snare_prob = probabilities[1].item() * 100
            hat_prob = probabilities[2].item() * 100
            tom_prob = probabilities[3].item() * 100
            
            max_prob = torch.max(probabilities).item()
            
            if max_prob > 0.30: 
                print(f"[{current_time:.2f}s] - Kick: {kick_prob:05.1f}% | Snare: {snare_prob:05.1f}% | Hat: {hat_prob:05.1f}% | Tom: {tom_prob:05.1f}%")
                
        # SLIDE THE WINDOW FORWARD (Crucial to prevent infinite loop!)
        current_time += stride

# --- RUN THE TEST ---
# Actually call the function down here!
analyze_loop("my_drum_loop3.mp3", stride=0.1, threshold=0.30)