// Default color map (fallback) – used only if main thread doesn't send one
const defaultColorMap = {
  "1": [231, 76, 60, 255],   // red
  "2": [52, 152, 219, 255],  // blue
  "3": [241, 196, 15, 255],  // yellow
};

self.onmessage = function (e) {
  const { points, k, accuracy, width, height, colorMap } = e.data;

  // Use provided color map or default
  const colors = colorMap || defaultColorMap;

  const imageData = new ImageData(width, height);
  const data = imageData.data;

  // Background color (dark gray)
  const bgColor = [26, 26, 26, 255];

  // If no points, fill with background color
  if (!points || points.length === 0) {
    for (let i = 0; i < data.length; i += 4) {
      data.set(bgColor, i);
    }
    self.postMessage(
      {
        type: "imageData",
        imageData: imageData,
      },
      [imageData.data.buffer]
    );
    return;
  }

  for (let x = 0; x < width; x += accuracy) {
    for (let y = 0; y < height; y += accuracy) {
      // KNN calculation
      const distances = points.map((p) => ({
        category: p.category,
        dist: Math.hypot(p.x - x, p.y - y),
      }));

      distances.sort((a, b) => a.dist - b.dist);
      const nearest = distances.slice(0, k);

      const counts = nearest.reduce((acc, { category }) => {
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {});

      const prediction = Object.entries(counts).sort(
        ([, a], [, b]) => b - a
      )[0][0];

      // Get predicted class color
      const rgba = colors[prediction] || bgColor;

      // Fill pixel block
      for (let dx = 0; dx < accuracy; dx++) {
        for (let dy = 0; dy < accuracy; dy++) {
          const px = x + dx;
          const py = y + dy;
          if (px < width && py < height) {
            const idx = (py * width + px) * 4;
            data.set(rgba, idx);
          }
        }
      }
    }
  }

  self.postMessage(
    {
      type: "imageData",
      imageData: imageData,
    },
    [imageData.data.buffer]
  );
};
