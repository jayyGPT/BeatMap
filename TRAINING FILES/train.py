import os
import torch
import librosa
import numpy as np
from torch.utils.data import Dataset, DataLoader

class DrumDataset(Dataset):
    def __init__(self, data_dir, duration=1.0, sr=22050):
        self.data_dir = data_dir
        self.duration = duration
        self.sr = sr
        self.file_paths = []
        self.labels = []
        
        # Map our 4 folder names to integer labels
        self.classes = {'kick': 0, 'snare': 1, 'overheads': 2, 'toms': 3}
        
        # Crawl the directories and grab every .wav file
        for class_name, label in self.classes.items():
            class_dir = os.path.join(data_dir, class_name)
            if os.path.exists(class_dir):
                for file in os.listdir(class_dir):
                    if file.endswith('.wav'):
                        self.file_paths.append(os.path.join(class_dir, file))
                        self.labels.append(label)

    def __len__(self):
        # Tells PyTorch exactly how many audio files we have
        return len(self.file_paths)

    def __getitem__(self, idx):
        '''
        This runs every time the GPU asks for a new image.
        It converts the .wav to our 128x44 Tensor.
        '''
        file_path = self.file_paths[idx]
        
        # 1. Load & Standardize Audio
        y, _ = librosa.load(file_path, sr=self.sr)
        target_length = int(self.sr * self.duration)
        y = librosa.util.fix_length(y, size=target_length)
        
        # 2. Create the Spectrogram
        spectrogram = librosa.feature.melspectrogram(y=y, sr=self.sr, n_mels=128)
        spectrogram_db = librosa.power_to_db(spectrogram, ref=np.max)
        
        # 3. Normalize (-80dB to 0dB becomes 0.0 to 1.0)
        spectrogram_normalized = (spectrogram_db + 80) / 80
        
        # 4. Convert to PyTorch Tensor -> Shape: (Channels, Height, Width) -> (1, 128, 44)
        tensor = torch.tensor(spectrogram_normalized, dtype=torch.float32).unsqueeze(0)
        label = torch.tensor(self.labels[idx], dtype=torch.long)
        
        return tensor, label

# --- TEST THE CONVEYOR BELT ---
# Point this to the exact folder where you unzipped the data
dataset = DrumDataset(data_dir='./data')

# The DataLoader groups the individual files into batches for the GPU
dataloader = DataLoader(dataset, batch_size=16, shuffle=True)

print(f"Successfully loaded {len(dataset)} drum samples ready for the GPU!")


import torch.nn as nn
import torch.optim as optim

# --- 1. INITIALIZE THE MODEL & GPU ---
# Define the exact architecture we built
class AudioAnalyzerCNN(nn.Module):
    def __init__(self):
        super(AudioAnalyzerCNN, self).__init__()
        self.conv = nn.Conv2d(in_channels=1, out_channels=8, kernel_size=3)
        self.relu = nn.ReLU()
        self.pool = nn.MaxPool2d(kernel_size=2, stride=2)
        self.dense = nn.Linear(10584, 4) # 4 Classes: Kicks, Snares, Hats, Toms

    def forward(self, x):
        x = self.conv(x)
        x = self.relu(x)
        x = self.pool(x)
        x = torch.flatten(x, 1) 
        x = self.dense(x)
        return x

# Detect the L40S GPU
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = AudioAnalyzerCNN().to(device)
print(f"Model loaded onto: {device}")

# --- 2. DEFINE LOSS & OPTIMIZER ---
# CrossEntropyLoss automatically applies Softmax for us in PyTorch!
criterion = nn.CrossEntropyLoss()
# Adam is the industry standard optimizer (better than plain gradient descent)
optimizer = optim.Adam(model.parameters(), lr=0.001)

# --- 3. THE MASTER TRAINING LOOP ---
epochs = 20

print("--- Starting GPU Training ---")
for epoch in range(epochs):
    running_loss = 0.0
    correct = 0
    total = 0
    
    for i, data in enumerate(dataloader, 0):
        # Move the audio matrices and labels to the GPU memory
        inputs, labels = data[0].to(device), data[1].to(device)

        # Zero the gradients (clear the memory from the last step)
        optimizer.zero_grad()

        # Forward Pass
        outputs = model(inputs)
        
        # Calculate Loss
        loss = criterion(outputs, labels)
        
        # Backward Pass (Calculus is done automatically here!)
        loss.backward()
        
        # Update Weights
        optimizer.step()

        # Track Accuracy & Loss
        running_loss += loss.item()
        _, predicted = torch.max(outputs.data, 1)
        total += labels.size(0)
        correct += (predicted == labels).sum().item()

    # Print stats at the end of each epoch
    accuracy = 100 * correct / total
    print(f"Epoch {epoch + 1:02d} | Loss: {running_loss/len(dataloader):.4f} | Accuracy: {accuracy:.2f}%")

print("--- Training Complete ---")

# --- 4. SAVE THE MODEL ---
# This exports the trained brain so we can host it on Hugging Face!
torch.save(model.state_dict(), "audio_analyzer_model.pt")
print("Saved PyTorch Model State to audio_analyzer_model.pt")