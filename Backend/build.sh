#!/usr/bin/env bash
# Render build script — installs Python deps and downloads NLTK data
set -o errexit

pip install -r requirements.txt

# Download required NLTK data
python -c "
import nltk
nltk.download('punkt', quiet=True)
nltk.download('punkt_tab', quiet=True)
nltk.download('stopwords', quiet=True)
nltk.download('vader_lexicon', quiet=True)
nltk.download('averaged_perceptron_tagger', quiet=True)
nltk.download('wordnet', quiet=True)
print('NLTK data downloaded')
"

echo "Build complete!"
