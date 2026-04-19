# Campus Food Navigator & Recommender AI
This project is a web application that helps students find nearby food stalls and get food recommendations based on their location and weather.

## Features
* Shows nearby food stalls using location
* Displays route to selected stall on map
* Recommends food using Machine Learning
* Uses **Decision Tree Classifier** for weather-based suggestions
  * Hot weather → Cold drinks
  * Cold weather → Hot food
* Finds nearest stall using KNN algorithm

## Technologies Used
* Frontend: HTML, CSS, JavaScript, Leaflet.js
* Backend: Python, Flask
* Machine Learning: Scikit-learn
* Dataset: CSV file

---

## How to Run
1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run the project:
```bash
python app.py
```

3. Open in browser:
```
http://127.0.0.1:5000/
```

## Project Structure
* `app.py` → Backend logic
* `dataset.csv` → Food data
* `templates/` → HTML files
* `static/` → CSS & JS

## Main Idea
This system combines:
* Location tracking
* Machine learning (Decision Tree)
* Weather data
to give **smart food recommendations**.


## Author
Manikanta
