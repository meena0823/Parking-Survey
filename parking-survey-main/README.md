# 🚗 Parking Survey - AI-Powered Vehicle Analytics

A full-stack application that uses computer vision to detect, track, and analyze vehicle parking patterns. Built with React, FastAPI, and YOLOv8.

## 🎯 Overview

Parking Survey leverages artificial intelligence to automatically detect vehicles in images, extract metadata, and provide actionable insights about parking behavior. Perfect for parking management, urban planning, and traffic analysis.

## ✨ Key Features

- **🤖 Intelligent Vehicle Detection**: YOLOv8-powered real-time vehicle detection
- **📸 Batch Image Processing**: Upload and process multiple vehicle images simultaneously
- **📊 Analytics Dashboard**: Visualize parking trends, vehicle distribution, and statistics
- **💾 Data Management**: Track parking sessions, vehicle metadata, and historical data
- **🎓 Custom Model Training**: Train specialized models on Indian vehicle datasets
- **🔍 Advanced Search**: Query and filter parking records by multiple criteria
- **📱 Responsive UI**: Modern React interface with real-time updates

## 🏗️ Architecture

```
parking-survey/
├── frontend/              # React + Vite application
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Page components
│   │   └── services/     # API integration
│   └── package.json
├── backend/               # FastAPI server
│   ├── models/           # ML models (YOLOv8)
│   ├── routes/           # API endpoints
│   ├── services/         # Business logic
│   ├── database/         # MongoDB/In-memory store
│   └── requirements.txt
└── README.md
```

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, Vite, Axios, Tailwind CSS |
| **Backend** | Python 3.9+, FastAPI, Uvicorn |
| **ML/CV** | YOLOv8, OpenCV, PyTorch |
| **Database** | MongoDB (optional), In-memory fallback |
| **Deployment** | Docker, Docker Compose |

## 📋 Prerequisites

- **Python** 3.9 or higher
- **Node.js** 16 or higher
- **npm** or **yarn**
- **MongoDB** (optional - uses in-memory store if not available)
- **Git**

## 🚀 Quick Start

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/satvik-05/parking-survey.git
cd parking-survey
```

### 2️⃣ Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run server
python main.py
```

**Backend runs on:** `http://localhost:8000`

### 3️⃣ Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

**Frontend runs on:** `http://localhost:5173`

### 4️⃣ Access the Application

Open your browser and navigate to: **http://localhost:5173**

## 🔧 Configuration

### Using MongoDB

```bash
export MONGO_URL="mongodb://localhost:27017"
export DB_NAME="parking_survey"
python main.py
```

### Environment Variables (Backend)

Create a `.env` file in the `backend/` directory:

```
MONGO_URL=mongodb://localhost:27017
DB_NAME=parking_survey
MODEL_PATH=./models/yolov8n.pt
DEBUG=True
```

## 📖 Usage Guide

### Upload & Process Images

1. Navigate to the **Upload** page (`/`)
2. Select vehicle images from your computer
3. Click "Process" to detect vehicles
4. View detection results with confidence scores

### View Analytics

1. Go to **Dashboard** (`/dashboard`)
2. Explore parking statistics and trends
3. Filter by date range or vehicle type
4. Export reports

### Manage Database

1. Access **Database** section (`/database`)
2. View all parking scans and sessions
3. Add manual entries
4. Edit or delete records

### Train Custom Model (Optional)

```bash
cd backend
python train_indian_model.py
```

This creates `indian_yolov8n.pt` for improved Indian vehicle detection.

## 📡 API Endpoints

### Images
- `POST /api/images/upload` - Upload vehicle images
- `GET /api/images` - List all images
- `GET /api/images/{id}` - Get image details

### Detections
- `GET /api/detections` - Get all detections
- `GET /api/detections/stats` - Get detection statistics
- `POST /api/detections/batch` - Batch process images

### Parking Sessions
- `GET /api/sessions` - List parking sessions
- `POST /api/sessions` - Create session
- `PUT /api/sessions/{id}` - Update session

### Analytics
- `GET /api/analytics/hourly` - Hourly statistics
- `GET /api/analytics/daily` - Daily statistics
- `GET /api/analytics/vehicle-types` - Vehicle distribution

## 🎓 Model Information

- **Default Model**: YOLOv8 Nano (yolov8n.pt)
- **Custom Model**: Indian vehicle dataset optimized
- **Input Size**: 640x640 pixels
- **Confidence Threshold**: 0.5 (adjustable)
- **Supported Classes**: Car, Truck, Bus, Motorcycle, Auto-rickshaw

## 📊 Example Workflow

```
1. Upload parking lot image
   ↓
2. AI detects all vehicles
   ↓
3. Extract vehicle metadata
   ↓
4. Store in database
   ↓
5. Generate analytics
   ↓
6. Visualize on dashboard
```

## 🐳 Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up --build
```

## 📝 API Response Example

```json
{
  "image_id": "img_123",
  "detections": [
    {
      "class": "Car",
      "confidence": 0.95,
      "bbox": [100, 150, 300, 400],
      "timestamp": "2026-06-07T10:30:00Z"
    }
  ],
  "total_vehicles": 1
}
```

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Troubleshooting

### Backend won't start
```bash
# Clear cache and reinstall
rm -rf venv
python -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### Frontend build errors
```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Model download issues
```bash
# Manually download YOLOv8
cd backend
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"
```

## 📞 Support

For issues and questions:
- 🐛 [Report Issues](https://github.com/satvik-05/parking-survey/issues)
- 💬 [Discussions](https://github.com/satvik-05/parking-survey/discussions)
- 📧 Contact: satvik-05

## 🙏 Acknowledgments

- YOLOv8 by Ultralytics
- FastAPI community
- React community

---

**Made with ❤️ for smarter parking management**
