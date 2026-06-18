"""
Fine-tune YOLOv8n on Indian vehicle data using transfer learning.
Downloads sample images and uses the existing uploaded images to train
a model that better recognizes Indian vehicles.

Usage:
    python train_indian_model.py

The trained model will be saved as indian_yolov8n.pt in the current directory.
"""

import os
import shutil
import urllib.request
import yaml
from pathlib import Path

# ── Configuration ────────────────────────────────────────────
DATASET_DIR = Path("/tmp/indian_vehicle_training")
TRAIN_DIR = DATASET_DIR / "train"
VAL_DIR = DATASET_DIR / "val"
EPOCHS = 30  # Enough for fine-tuning, won't take too long on CPU
IMG_SIZE = 640
MODEL_OUTPUT = "indian_yolov8n.pt"

# Classes for Indian parking survey
CLASSES = ["Car", "Truck", "Motorcycle", "Bus", "Bicycle", "Auto-Rickshaw"]


def setup_dataset():
    """Prepare the dataset directory structure."""
    for split in [TRAIN_DIR, VAL_DIR]:
        (split / "images").mkdir(parents=True, exist_ok=True)
        (split / "labels").mkdir(parents=True, exist_ok=True)

    # Sample public-domain vehicle images for fine-tuning
    # These are free-to-use images from various sources
    sample_images = [
        # Cars
        ("https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/2019_Toyota_Corolla_1.8_VVT-i_Icon_Tech_CVT_Front.jpg/1280px-2019_Toyota_Corolla_1.8_VVT-i_Icon_Tech_CVT_Front.jpg", "car_01.jpg",
         "0 0.50 0.50 0.85 0.75"),  # class x_center y_center width height
        ("https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Suzuki_Swift_%28AZG%29_%E2%80%93_Frontansicht%2C_21._Juni_2011%2C_W%C3%BClfrath.jpg/1280px-Suzuki_Swift_%28AZG%29_%E2%80%93_Frontansicht%2C_21._Juni_2011%2C_W%C3%BClfrath.jpg", "car_02.jpg",
         "0 0.50 0.45 0.80 0.70"),
        # Trucks
        ("https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Eicher_truck.JPG/1280px-Eicher_truck.JPG", "truck_01.jpg",
         "1 0.50 0.50 0.90 0.85"),
        ("https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/TATA_LPT_407_truck.JPG/1024px-TATA_LPT_407_truck.JPG", "truck_02.jpg",
         "1 0.50 0.50 0.85 0.80"),
        # Motorcycles
        ("https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/300px-Camponotus_flavomarginatus_ant.jpg", None, None),  # skip
        # Bus
        ("https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/LT_471_%28LTZ_1471%29_Arriva_London_New_Routemaster_%2819522859218%29.jpg/1280px-LT_471_%28LTZ_1471%29_Arriva_London_New_Routemaster_%2819522859218%29.jpg", "bus_01.jpg",
         "3 0.50 0.50 0.90 0.85"),
        # Bicycle
        ("https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Left_side_of_Flying_Pigeon.jpg/1024px-Left_side_of_Flying_Pigeon.jpg", "bicycle_01.jpg",
         "4 0.50 0.50 0.85 0.75"),
    ]

    count = 0
    for url, fname, label in sample_images:
        if fname is None:
            continue
        try:
            img_path = TRAIN_DIR / "images" / fname
            label_path = TRAIN_DIR / "labels" / fname.replace(".jpg", ".txt")

            if not img_path.exists():
                print(f"  Downloading {fname}...")
                urllib.request.urlretrieve(url, str(img_path))

            with open(label_path, "w") as f:
                f.write(label + "\n")

            count += 1
        except Exception as e:
            print(f"  Failed to download {fname}: {e}")

    # Also use existing uploaded images as training data
    uploads_dir = Path("uploads")
    if uploads_dir.exists():
        # Use pre-existing YOLO model to auto-label uploaded images
        try:
            from ultralytics import YOLO
            model = YOLO("yolov8n.pt")

            for img_file in uploads_dir.iterdir():
                if img_file.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
                    continue

                # Run detection
                results = model(str(img_file), verbose=False)
                labels = []
                for result in results:
                    img_h, img_w = result.orig_shape
                    for box in result.boxes:
                        cls_id = int(box.cls[0])
                        conf = float(box.conf[0])
                        if conf < 0.2:
                            continue

                        # Map COCO class to our classes
                        cls_map = {2: 0, 7: 1, 3: 2, 5: 3, 1: 4}
                        if cls_id not in cls_map:
                            continue

                        our_cls = cls_map[cls_id]
                        x1, y1, x2, y2 = box.xyxy[0].tolist()
                        # Convert to YOLO format (normalized x_center, y_center, width, height)
                        x_center = ((x1 + x2) / 2) / img_w
                        y_center = ((y1 + y2) / 2) / img_h
                        w = (x2 - x1) / img_w
                        h = (y2 - y1) / img_h
                        labels.append(f"{our_cls} {x_center:.6f} {y_center:.6f} {w:.6f} {h:.6f}")

                if labels:
                    # Copy image to training set
                    dest_img = TRAIN_DIR / "images" / f"upload_{img_file.stem}.jpg"
                    dest_label = TRAIN_DIR / "labels" / f"upload_{img_file.stem}.txt"

                    from PIL import Image
                    img = Image.open(img_file)
                    img.save(str(dest_img), "JPEG")

                    with open(dest_label, "w") as f:
                        f.write("\n".join(labels) + "\n")

                    count += 1

        except Exception as e:
            print(f"  Auto-labeling failed: {e}")

    # Copy some images to validation set
    train_images = list((TRAIN_DIR / "images").glob("*"))
    val_count = max(1, len(train_images) // 5)  # 20% for validation
    for img in train_images[:val_count]:
        label = TRAIN_DIR / "labels" / img.with_suffix(".txt").name
        shutil.copy2(img, VAL_DIR / "images" / img.name)
        if label.exists():
            shutil.copy2(label, VAL_DIR / "labels" / label.name)

    print(f"  Dataset ready: {count} training images")
    return count


def create_yaml():
    """Create the dataset YAML configuration."""
    data = {
        "path": str(DATASET_DIR),
        "train": "train/images",
        "val": "val/images",
        "nc": len(CLASSES),
        "names": CLASSES,
    }
    yaml_path = DATASET_DIR / "data.yaml"
    with open(yaml_path, "w") as f:
        yaml.dump(data, f)
    return str(yaml_path)


def train():
    """Fine-tune YOLOv8n for Indian vehicles."""
    from ultralytics import YOLO

    print("=" * 60)
    print("  Indian Vehicle Model — Fine-Tuning")
    print("=" * 60)

    # Step 1: Prepare dataset
    print("\n📦 Preparing dataset...")
    num_images = setup_dataset()
    if num_images == 0:
        print("❌ No training images available!")
        return

    # Step 2: Create config
    yaml_path = create_yaml()
    print(f"📄 Config: {yaml_path}")

    # Step 3: Fine-tune
    print(f"\n🚀 Fine-tuning YOLOv8n for {EPOCHS} epochs...")
    print("   (This may take 10-30 minutes on CPU)\n")

    model = YOLO("yolov8n.pt")  # Start from pre-trained COCO weights
    results = model.train(
        data=yaml_path,
        epochs=EPOCHS,
        imgsz=IMG_SIZE,
        batch=8,
        patience=10,       # Early stopping
        device="cpu",       # Use CPU (no GPU available)
        workers=2,
        project="/tmp/indian_vehicle_runs",
        name="train",
        exist_ok=True,
        pretrained=True,
        verbose=True,
    )

    # Step 4: Copy best weights
    best_weights = Path("/tmp/indian_vehicle_runs/train/weights/best.pt")
    if best_weights.exists():
        shutil.copy2(best_weights, MODEL_OUTPUT)
        print(f"\n✅ Model saved to: {MODEL_OUTPUT}")
        print("   Update cv_pipeline.py to use this model:")
        print(f'   _yolo_model = YOLO("{MODEL_OUTPUT}")')
    else:
        # Fallback to last weights
        last_weights = Path("/tmp/indian_vehicle_runs/train/weights/last.pt")
        if last_weights.exists():
            shutil.copy2(last_weights, MODEL_OUTPUT)
            print(f"\n✅ Model saved to: {MODEL_OUTPUT}")

    return MODEL_OUTPUT


if __name__ == "__main__":
    train()
