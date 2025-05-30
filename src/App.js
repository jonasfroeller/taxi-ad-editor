import React, { useState, useRef, useEffect } from 'react';
import { changeDpiDataUrl } from 'changedpi';
import './App.css';

const ThumbnailEditor = () => {
  const canvasRef = useRef(null);
  const [images, setImages] = useState([]);
  const [texts, setTexts] = useState([]);
  const [rectangles, setRectangles] = useState([]);
  const [selectedTool, setSelectedTool] = useState('select');
  const [selectedElement, setSelectedElement] = useState(null);
  const [exportFormat, setExportFormat] = useState('png');
  const [isDragging, setIsDragging] = useState(false);
  const [draggedElement, setDraggedElement] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [showTextDialog, setShowTextDialog] = useState(false);
  const [newText, setNewText] = useState('');
  const [textStyle, setTextStyle] = useState({
    fontSize: 24,
    fontFamily: 'Arial',
    color: '#000000',
    fontWeight: 'normal',
    fontStyle: 'normal'
  });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState(null);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [editingTextIndex, setEditingTextIndex] = useState(null);
  const [inlineInputValue, setInlineInputValue] = useState('');
  const [newTextPosition, setNewTextPosition] = useState({ x: 768 / 2, y: 256 / 2 });
  const [exportPpi, setExportPpi] = useState(360);

  const initialBackgroundConfig = {
    type: 'solid', // solid, linear, radial
    colors: [{ id: Date.now(), color: '#ffffff', stop: 0 }], // For solid, only first color used
    angle: 90, // For linear
    radialShape: 'ellipse', // 'ellipse' or 'circle'
    radialExtent: 'farthest-corner', // 'closest-side', 'closest-corner', 'farthest-side', 'farthest-corner'
    radialCenterX: '50%',
    radialCenterY: '50%',
  };
  const [backgroundConfig, setBackgroundConfig] = useState(initialBackgroundConfig);

  // Canvas dimensions - display size (3:1 ratio)
  const DISPLAY_WIDTH = 768;
  const DISPLAY_HEIGHT = 256;
  
  // Export dimensions
  const EXPORT_WIDTH = 384;
  const EXPORT_HEIGHT = 128;

  const DEFAULT_RECT_WIDTH = 150;
  const DEFAULT_RECT_HEIGHT = 80;

  useEffect(() => {
    redrawCanvas();
  }, [images, texts, rectangles, selectedElement, backgroundConfig]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
    };
    const handleKeyUp = (e) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const parseCanvasGradient = (ctx, config, width, height) => {
    if (config.type === 'solid') {
      return config.colors[0]?.color || '#ffffff';
    }
    if (config.type === 'linear') {
      if (!config.colors || config.colors.length < 1) return '#ffffff'; // Need at least one color
      if (config.colors.length === 1) return config.colors[0].color; // Treat as solid if only one color

      let angle = config.angle || 0;
      let startX = 0, startY = 0, endX = 0, endY = 0;

      // Simplified angle to x,y mapping for createLinearGradient
      // (0,0) is top-left. Angles in CSS are different from typical math angles.
      // CSS: 0deg to top, 90deg to right, 180deg to bottom, 270deg to left.
      const rad = (angle - 90) * Math.PI / 180; // Adjust angle for math cos/sin (0 = right)
      startX = 0; 
      startY = height / 2; // Start at mid-left for horizontal gradients by default
      endX = width;
      endY = height / 2; // End at mid-right

      if (angle === 0) { // To Top
        startX = width / 2; startY = height; endX = width / 2; endY = 0;
      } else if (angle === 90) { // To Right
        startX = 0; startY = height / 2; endX = width; endY = height / 2;
      } else if (angle === 180) { // To Bottom
        startX = width / 2; startY = 0; endX = width / 2; endY = height;
      } else if (angle === 270) { // To Left
        startX = width; startY = height / 2; endX = 0; endY = height / 2;
      } else if (angle > 0 && angle < 90) { // Top-right quadrant
        startX = 0; startY = height; endX = width; endY = 0;
      } else if (angle > 90 && angle < 180) { // Bottom-right quadrant
        startX = 0; startY = 0; endX = width; endY = height;
      } else if (angle > 180 && angle < 270) { // Bottom-left quadrant
        startX = width; startY = 0; endX = 0; endY = height;
      } else if (angle > 270 && angle < 360) { // Top-left quadrant
        startX = width; startY = height; endX = 0; endY = 0;
      }

      const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
      const sortedColors = [...config.colors].sort((a, b) => a.stop - b.stop);
      
      sortedColors.forEach(stop => {
        // Ensure stop is between 0 and 1 for addColorStop
        const offset = Math.max(0, Math.min(1, stop.stop / 100));
        gradient.addColorStop(offset, stop.color);
      });
      return gradient;
    }
    if (config.type === 'radial') {
      if (!config.colors || config.colors.length < 1) return '#ffffff';
      if (config.colors.length === 1) return config.colors[0].color;

      const centerXStr = config.radialCenterX || '50%';
      const centerYStr = config.radialCenterY || '50%';
      const shape = config.radialShape || 'ellipse';
      const extent = config.radialExtent || 'farthest-corner';

      const cx = parseFloat(centerXStr) / 100 * width;
      const cy = parseFloat(centerYStr) / 100 * height;
      let r1 = 0;

      // Distances from center to the 4 corners
      const distToCorners = [
        Math.sqrt(cx*cx + cy*cy), // top-left
        Math.sqrt(Math.pow(width-cx,2) + cy*cy), // top-right
        Math.sqrt(cx*cx + Math.pow(height-cy,2)), // bottom-left
        Math.sqrt(Math.pow(width-cx,2) + Math.pow(height-cy,2)) // bottom-right
      ];
      // Distances from center to the 4 sides (absolute values)
      const distToSides = [
        cy, // to top
        width - cx, // to right
        height - cy, // to bottom
        cx // to left
      ];

      switch (extent) {
        case 'closest-side':
          r1 = Math.min(...distToSides.map(d => Math.abs(d)).filter(d => d >= 0));
          break;
        case 'closest-corner':
          r1 = Math.min(...distToCorners.filter(d => d >= 0));
          break;
        case 'farthest-side':
          r1 = Math.max(...distToSides.map(d => Math.abs(d)).filter(d => d >= 0));
          break;
        case 'farthest-corner':
        default:
          r1 = Math.max(...distToCorners.filter(d => d >= 0));
          break;
      }
      
      if (shape === 'circle') {
        // For a circle, r1 is straightforward.
      } else { // Ellipse: HTML canvas createRadialGradient makes circles.
               // We use r1 as the radius of the larger circle that would encompass the ellipse defined by the extent.
               // This is a simplification. For a true ellipse, one might scale the context.
      }
      if (r1 <= 0) r1 = Math.max(width, height);

      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r1);
      const sortedColors = [...config.colors].sort((a, b) => a.stop - b.stop);
      sortedColors.forEach(stop => {
        const offset = Math.max(0, Math.min(1, stop.stop / 100));
        gradient.addColorStop(offset, stop.color);
      });
      return gradient;
    }
    return '#ffffff';
  };

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    console.log('Redrawing canvas with texts:', texts);
    
    ctx.clearRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);

    const bgStyle = parseCanvasGradient(ctx, backgroundConfig, DISPLAY_WIDTH, DISPLAY_HEIGHT);
    ctx.fillStyle = bgStyle;
    ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
    
    images.forEach((img, index) => {
      if (img.element && img.element.complete) {
        ctx.drawImage(
          img.element, 
          img.x, 
          img.y, 
          img.width, 
          img.height
        );
        
        // Draw selection handles for selected image
        if (selectedElement && selectedElement.type === 'image' && selectedElement.index === index) {
          drawSelectionHandles(ctx, img.x, img.y, img.width, img.height);
        }
      }
    });
    
    // Draw rectangles
    rectangles.forEach((rectEl, index) => {
      ctx.fillStyle = rectEl.backgroundColor;
      ctx.strokeStyle = rectEl.borderColor;
      ctx.lineWidth = rectEl.borderWidth;

      ctx.beginPath();
      if (rectEl.borderRadius > 0) {
        // Draw rounded rectangle
        ctx.moveTo(rectEl.x + rectEl.borderRadius, rectEl.y);
        ctx.arcTo(rectEl.x + rectEl.width, rectEl.y, rectEl.x + rectEl.width, rectEl.y + rectEl.height, rectEl.borderRadius);
        ctx.arcTo(rectEl.x + rectEl.width, rectEl.y + rectEl.height, rectEl.x, rectEl.y + rectEl.height, rectEl.borderRadius);
        ctx.arcTo(rectEl.x, rectEl.y + rectEl.height, rectEl.x, rectEl.y, rectEl.borderRadius);
        ctx.arcTo(rectEl.x, rectEl.y, rectEl.x + rectEl.width, rectEl.y, rectEl.borderRadius);
      } else {
        // Draw sharp rectangle
        ctx.rect(rectEl.x, rectEl.y, rectEl.width, rectEl.height);
      }
      ctx.closePath();

      if (rectEl.backgroundColor && rectEl.backgroundColor !== 'transparent') {
          ctx.fill();
      }
      if (rectEl.borderWidth > 0 && rectEl.borderColor) {
        ctx.stroke();
      }

      // Draw selection handles for selected rectangle
      if (selectedElement && selectedElement.type === 'rectangle' && selectedElement.index === index) {
        drawSelectionHandles(ctx, rectEl.x, rectEl.y, rectEl.width, rectEl.height);
      }
    });
    
    // Draw texts
    texts.forEach((text, index) => {
      console.log('Drawing text:', text.content, 'at position:', text.x, text.y);
      ctx.font = `${text.style.fontStyle} ${text.style.fontWeight} ${text.style.fontSize}px ${text.style.fontFamily}`;
      ctx.fillStyle = text.style.color;

      // Do not draw text if it's being edited inline
      if (index === editingTextIndex) {
        // Optionally, draw a light placeholder or nothing
      } else {
        ctx.fillText(text.content, text.x, text.y);
      }
      
      // Draw selection indicator for selected text (even if being edited, to show selection box)
      // BUT NOT if it's currently being inline-edited, as the inline editor has its own border.
      if (selectedElement && selectedElement.type === 'text' && selectedElement.index === index && index !== editingTextIndex) {
        const metrics = ctx.measureText(text.content);
        const ascent = metrics.actualBoundingBoxAscent;
        const descent = metrics.actualBoundingBoxDescent;
        const validAscent = (typeof ascent === 'number' && isFinite(ascent)) ? ascent : text.style.fontSize * 0.8;
        const validDescent = (typeof descent === 'number' && isFinite(descent)) ? descent : text.style.fontSize * 0.2;
        const textActualHeight = validAscent + validDescent;
        const textActualTopY = text.y - validAscent;

        const selectionBoxPadding = 2; // Padding around the text for the selection box

        drawTextSelection(
          ctx, 
          text.x - selectionBoxPadding, 
          textActualTopY - selectionBoxPadding, 
          metrics.width + (2 * selectionBoxPadding), 
          textActualHeight + (2 * selectionBoxPadding)
        );
      }
    });
  };

  const drawSelectionHandles = (ctx, x, y, width, height) => {
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
    
    // Draw resize handles
    const handleSize = 8;
    ctx.fillStyle = '#2563eb';
    
    const handles = [
      { x: x - handleSize/2, y: y - handleSize/2 }, // top-left
      { x: x + width - handleSize/2, y: y - handleSize/2 }, // top-right
      { x: x - handleSize/2, y: y + height - handleSize/2 }, // bottom-left
      { x: x + width - handleSize/2, y: y + height - handleSize/2 }, // bottom-right
      { x: x + width/2 - handleSize/2, y: y - handleSize/2 }, // top-center
      { x: x + width/2 - handleSize/2, y: y + height - handleSize/2 }, // bottom-center
      { x: x - handleSize/2, y: y + height/2 - handleSize/2 }, // left-center
      { x: x + width - handleSize/2, y: y + height/2 - handleSize/2 }, // right-center
    ];
    
    handles.forEach(handle => {
      ctx.fillRect(handle.x, handle.y, handleSize, handleSize);
    });
  };

  const drawTextSelection = (ctx, x, y, width, height) => {
    ctx.strokeStyle = '#2563eb'; // Same color as inline editor border
    ctx.lineWidth = 1;           // Same line width as inline editor border
    ctx.setLineDash([2, 2]);     // A tight dash pattern
    // Draw the rectangle tightly around the text metrics
    // x is the left, y IS THE TOP, width is width, height is height (fontSize)
    ctx.strokeRect(x, y, width, height);
    ctx.setLineDash([]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Calculate drop position relative to the canvas
    const dropX = e.clientX - rect.left;
    const dropY = e.clientY - rect.top;
    
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            // Calculate size to fit within canvas while maintaining aspect ratio
            const maxWidth = DISPLAY_WIDTH * 0.6;
            const maxHeight = DISPLAY_HEIGHT * 0.6;
            
            let { width, height } = img;
            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }
            if (height > maxHeight) {
              width = (width * maxHeight) / height;
              height = maxHeight;
            }
            
            const newImage = {
              id: Date.now() + Math.random(),
              element: img,
              x: dropX - width / 2,
              y: dropY - height / 2,
              width,
              height,
              originalWidth: img.width,
              originalHeight: img.height
            };
            
            setImages(prev => [...prev, newImage]);
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const getResizeHandle = (x, y, element) => {
    const handleSize = 8;
    const handles = [
      { name: 'nw', x: element.x - handleSize/2, y: element.y - handleSize/2 },
      { name: 'ne', x: element.x + element.width - handleSize/2, y: element.y - handleSize/2 },
      { name: 'sw', x: element.x - handleSize/2, y: element.y + element.height - handleSize/2 },
      { name: 'se', x: element.x + element.width - handleSize/2, y: element.y + element.height - handleSize/2 },
      { name: 'n', x: element.x + element.width/2 - handleSize/2, y: element.y - handleSize/2 },
      { name: 's', x: element.x + element.width/2 - handleSize/2, y: element.y + element.height - handleSize/2 },
      { name: 'w', x: element.x - handleSize/2, y: element.y + element.height/2 - handleSize/2 },
      { name: 'e', x: element.x + element.width - handleSize/2, y: element.y + element.height/2 - handleSize/2 },
    ];
    
    for (let handle of handles) {
      if (x >= handle.x && x <= handle.x + handleSize && 
          y >= handle.y && y <= handle.y + handleSize) {
        return handle.name;
      }
    }
    return null;
  };

  const handleCanvasMouseDown = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicking on resize handle for selected image OR RECTANGLE
    if (selectedElement && (selectedElement.type === 'image' || selectedElement.type === 'rectangle')) {
      const element = selectedElement.type === 'image' 
                      ? images[selectedElement.index]
                      : rectangles[selectedElement.index];
      const handle = getResizeHandle(x, y, element);
      if (handle) {
        setIsResizing(true);
        setResizeHandle(handle);
        return;
      }
    }

    // Priority: Texts, then Rectangles, then Images
    // Check if clicking on text
    for (let i = texts.length - 1; i >= 0; i--) {
      const text = texts[i];
      const canvasCtx = canvas.getContext('2d'); // Use canvasRef for context
      canvasCtx.font = `${text.style.fontStyle} ${text.style.fontWeight} ${text.style.fontSize}px ${text.style.fontFamily}`;
      const metrics = canvasCtx.measureText(text.content);
      
      // Approximate clickable area: consider ascent and descent for more accuracy
      const ascent = metrics.actualBoundingBoxAscent || text.style.fontSize * 0.8;
      const descent = metrics.actualBoundingBoxDescent || text.style.fontSize * 0.2;
      const textHeight = ascent + descent;
      const textTopY = text.y - ascent; // Y is baseline, so top is y - ascent

      if (x >= text.x && x <= text.x + metrics.width && 
          y >= textTopY && y <= textTopY + textHeight) {
        setSelectedElement({ type: 'text', index: i });
        setDraggedElement({ type: 'text', index: i });
        setDragOffset({ x: x - text.x, y: y - text.y });
        setIsDragging(true);
        return;
      }
    }

    // Check if clicking on a rectangle
    for (let i = rectangles.length - 1; i >= 0; i--) {
      const rectEl = rectangles[i];
      if (x >= rectEl.x && x <= rectEl.x + rectEl.width &&
          y >= rectEl.y && y <= rectEl.y + rectEl.height) {
        setSelectedElement({ type: 'rectangle', index: i });
        setDraggedElement({ type: 'rectangle', index: i });
        setDragOffset({ x: x - rectEl.x, y: y - rectEl.y });
        setIsDragging(true);
        return;
      }
    }
    
    // Check if clicking on an image
    for (let i = images.length - 1; i >= 0; i--) {
      const img = images[i];
      if (x >= img.x && x <= img.x + img.width && 
          y >= img.y && y <= img.y + img.height) {
        setSelectedElement({ type: 'image', index: i });
        setDraggedElement({ type: 'image', index: i });
        setDragOffset({ x: x - img.x, y: y - img.y });
        setIsDragging(true);
        return;
      }
    }

    // Clear selection if clicking empty area
    setSelectedElement(null);

    // If no element clicked and text tool is selected, add text
    if (selectedTool === 'text' && !draggedElement) {
      setNewText('');
      setTextStyle({
        fontSize: 24,
        fontFamily: 'Arial',
        color: '#000000',
        fontWeight: 'normal',
        fontStyle: 'normal'
      });
      setEditingTextIndex(null);
      setNewTextPosition({ x, y }); // Store click position
      setShowTextDialog(true);
    } else if (selectedTool === 'rectangle' && !draggedElement) {
      // Add a new rectangle if rectangle tool is selected and clicked on empty space
      const newRect = {
        id: Date.now(),
        type: 'rectangle',
        x: x - DEFAULT_RECT_WIDTH / 2,
        y: y - DEFAULT_RECT_HEIGHT / 2,
        width: DEFAULT_RECT_WIDTH,
        height: DEFAULT_RECT_HEIGHT,
        backgroundColor: '#cccccc',
        borderColor: '#333333',
        borderWidth: 2,
        borderRadius: 0,
        originalWidth: DEFAULT_RECT_WIDTH,
        originalHeight: DEFAULT_RECT_HEIGHT,
      };
      setRectangles(prev => [...prev, newRect]);
      setSelectedElement({ type: 'rectangle', index: rectangles.length }); // Auto-select the new rectangle
      setSelectedTool('select'); // Switch to select tool after adding
    }
  };

  const handleCanvasDoubleClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ctx = canvas.getContext('2d');

    // If an inline edit is active and the click is outside the potential input area, commit edit.
    if (editingTextIndex !== null) {
      // This logic might need refinement if the input is a child of the canvas's parent
    }

    // Priority for double click: Texts (for editing), then Rectangles, then Images
    // Check if clicking on text
    for (let i = texts.length - 1; i >= 0; i--) {
      const text = texts[i];
      ctx.font = `${text.style.fontStyle} ${text.style.fontWeight} ${text.style.fontSize}px ${text.style.fontFamily}`;
      const metrics = ctx.measureText(text.content);
      
      const ascent = metrics.actualBoundingBoxAscent || text.style.fontSize * 0.8;
      const descent = metrics.actualBoundingBoxDescent || text.style.fontSize * 0.2;
      const textHeight = ascent + descent;
      const textTopY = text.y - ascent;

      if (x >= text.x && x <= text.x + metrics.width && y >= textTopY && y <= textTopY + textHeight) {
        setSelectedElement({ type: 'text', index: i });
        setEditingTextIndex(i);
        setInlineInputValue(text.content);
        return; 
      }
    }
    
    // Check if clicking on a rectangle
    for (let i = rectangles.length - 1; i >= 0; i--) {
        const rectEl = rectangles[i];
        if (x >= rectEl.x && x <= rectEl.x + rectEl.width &&
            y >= rectEl.y && y <= rectEl.y + rectEl.height) {
          setSelectedElement({ type: 'rectangle', index: i });
          // No specific double-click action for rectangles for now, just select
          return;
        }
    }

    // Check if clicking on an image
    for (let i = images.length - 1; i >= 0; i--) {
      const img = images[i];
      if (x >= img.x && x <= img.x + img.width && 
          y >= img.y && y <= img.y + img.height) {
        setSelectedElement({ type: 'image', index: i });
        // No specific double-click action for images for now, just select
        return;
      }
    }
  };

  const handleCanvasMouseMove = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isResizing && selectedElement && (selectedElement.type === 'image' || selectedElement.type === 'rectangle')) {
      const elementType = selectedElement.type;
      const elementIndex = selectedElement.index;

      const updateFunc = elementType === 'image' ? setImages : setRectangles;

      updateFunc(prevElements => prevElements.map((element, index) => {
        if (index === elementIndex) {
          let nX = element.x;
          let nY = element.y;
          let nW = element.width;
          let nH = element.height;
          // Aspect ratio for images, free resize for rectangles by default for now
          // Can add Shift key for aspect ratio for rectangles later if needed
          const originalAspectRatio = elementType === 'image' ? element.originalWidth / element.originalHeight : 0;

          // Store the element's state *before* this resize operation for anchor calculations.
          const currentX = element.x;
          const currentY = element.y;
          const currentW = element.width;
          const currentH = element.height;

          if (isShiftPressed && ['nw', 'ne', 'sw', 'se'].includes(resizeHandle)) {
            // Aspect ratio locked resize for corner handles
            switch (resizeHandle) {
              case 'se': { // Anchor: top-left
                const anchorX = currentX;
                const anchorY = currentY;
                let targetW = x - anchorX;
                let targetH = y - anchorY;
                if (originalAspectRatio === 0) { // Avoid division by zero, treat as free resize
                  nW = Math.max(20, targetW);
                  nH = Math.max(20, targetH);
                } else if (targetW / originalAspectRatio >= targetH) {
                  nW = targetW;
                  nH = nW / originalAspectRatio;
                } else {
                  nH = targetH;
                  nW = nH * originalAspectRatio;
                }
                nX = anchorX;
                nY = anchorY;
                break;
              }
              case 'sw': { // Anchor: top-right
                const anchorX = currentX + currentW;
                const anchorY = currentY;
                let targetW = anchorX - x;
                let targetH = y - anchorY;
                if (originalAspectRatio === 0) {
                  nW = Math.max(20, targetW);
                  nH = Math.max(20, targetH);
                } else if (targetW / originalAspectRatio >= targetH) {
                  nW = targetW;
                  nH = nW / originalAspectRatio;
                } else {
                  nH = targetH;
                  nW = nH * originalAspectRatio;
                }
                nX = anchorX - nW;
                nY = anchorY;
                break;
              }
              case 'ne': { // Anchor: bottom-left
                const anchorX = currentX;
                const anchorY = currentY + currentH;
                let targetW = x - anchorX;
                let targetH = anchorY - y;
                 if (originalAspectRatio === 0) {
                  nW = Math.max(20, targetW);
                  nH = Math.max(20, targetH);
                } else if (targetW / originalAspectRatio >= targetH) {
                  nW = targetW;
                  nH = nW / originalAspectRatio;
                } else {
                  nH = targetH;
                  nW = nH * originalAspectRatio;
                }
                nX = anchorX;
                nY = anchorY - nH;
                break;
              }
              case 'nw': { // Anchor: bottom-right
                const anchorX = currentX + currentW;
                const anchorY = currentY + currentH;
                let targetW = anchorX - x;
                let targetH = anchorY - y;
                if (originalAspectRatio === 0) {
                  nW = Math.max(20, targetW);
                  nH = Math.max(20, targetH);
                } else if (targetW / originalAspectRatio >= targetH) {
                  nW = targetW;
                  nH = nW / originalAspectRatio;
                } else {
                  nH = targetH;
                  nW = nH * originalAspectRatio;
                }
                nX = anchorX - nW;
                nY = anchorY - nH;
                break;
              }
            }

            // Apply minimum size constraints AFTER aspect ratio calculation
            // And re-adjust the other dimension and position if necessary
            let finalW = nW;
            let finalH = nH;

            if (originalAspectRatio > 0) { // Only apply aspect ratio clamping if AR is valid
              if (finalW < 20 && finalH < 20) { // If both dimensions would be too small
                  if (finalW / originalAspectRatio >= finalH) { // Width is 'more too small' or equally
                      finalW = 20;
                      finalH = finalW / originalAspectRatio;
                  } else { // Height is 'more too small'
                      finalH = 20;
                      finalW = finalH * originalAspectRatio;
                  }
                  // One more pass to ensure the other isn't too small after fixing one
                  if (finalW < 20) { finalW = 20; finalH = finalW / originalAspectRatio;}
                  if (finalH < 20) { finalH = 20; finalW = finalH * originalAspectRatio;}

              } else if (finalW < 20) {
                  finalW = 20;
                  finalH = finalW / originalAspectRatio;
              } else if (finalH < 20) {
                  finalH = 20;
                  finalW = finalH * originalAspectRatio;
              }
            } else { // Fallback for zero aspect ratio - just clamp individually
                finalW = Math.max(20, finalW);
                finalH = Math.max(20, finalH);
            }
            
            nW = Math.max(20, finalW); // Ensure at least 20px after all calculations
            nH = Math.max(20, finalH); // Ensure at least 20px

            // Recalculate positions based on the *final* clamped nW, nH
            switch (resizeHandle) {
                case 'se':
                    nX = currentX; nY = currentY;
                    break;
                case 'sw':
                    nX = (currentX + currentW) - nW; nY = currentY;
                    break;
                case 'ne':
                    nX = currentX; nY = (currentY + currentH) - nH;
                    break;
                case 'nw':
                    nX = (currentX + currentW) - nW; nY = (currentY + currentH) - nH;
                    break;
            }

          } else { // (no shift, or edge handles)
            switch (resizeHandle) {
              case 'se':
                nW = Math.max(20, x - currentX);
                nH = Math.max(20, y - currentY);
                break;
              case 'sw':
                nW = Math.max(20, currentX + currentW - x);
                nH = Math.max(20, y - currentY);
                nX = x;
                break;
              case 'ne':
                nW = Math.max(20, x - currentX);
                nH = Math.max(20, currentY + currentH - y);
                nY = y;
                break;
              case 'nw':
                nW = Math.max(20, currentX + currentW - x);
                nH = Math.max(20, currentY + currentH - y);
                nX = x;
                nY = y;
                break;
              case 'e':
                nW = Math.max(20, x - currentX);
                nH = currentH;
                nX = currentX;
                nY = currentY;
                break;
              case 'w':
                nW = Math.max(20, currentX + currentW - x);
                nX = x;
                nH = currentH;
                nY = currentY;
                break;
              case 'n':
                nH = Math.max(20, currentY + currentH - y);
                nY = y;
                nW = currentW;
                nX = currentX;
                break;
              case 's':
                nH = Math.max(20, y - currentY);
                nW = currentW;
                nX = currentX;
                nY = currentY;
                break;
            }
          }
          return { ...element, x: nX, y: nY, width: nW, height: nH };
        }
        return element;
      }));
      return;
    }

    if (!isDragging || !draggedElement) return;

    if (draggedElement.type === 'image') {
      setImages(prev => prev.map((img, index) => 
        index === draggedElement.index 
          ? { ...img, x: x - dragOffset.x, y: y - dragOffset.y }
          : img
      ));
    } else if (draggedElement.type === 'text') {
      setTexts(prev => prev.map((text, index) => 
        index === draggedElement.index 
          ? { ...text, x: x - dragOffset.x, y: y - dragOffset.y }
          : text
      ));
    } else if (draggedElement.type === 'rectangle') {
      setRectangles(prev => prev.map((rectEl, index) =>
        index === draggedElement.index
          ? { ...rectEl, x: x - dragOffset.x, y: y - dragOffset.y }
          : rectEl
      ));
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
    setDraggedElement(null);
    setIsResizing(false);
    setResizeHandle(null);
  };

  const handleSaveText = () => {
    if (newText.trim()) {
      // Editing existing text is handled by the inline editor's blur/enter.
      const newTextObj = {
        id: Date.now() + Math.random(),
        content: newText,
        x: newTextPosition.x, // Use stored x position
        y: newTextPosition.y, // Use stored y position
        style: { ...textStyle } // textStyle is from the dialog state
      };
      setTexts(prev => [...prev, newTextObj]);
      setShowTextDialog(false);
      setNewText('');
      setEditingTextIndex(null); 
      setTextStyle({ fontSize: 24, fontFamily: 'Arial', color: '#000000', fontWeight: 'normal', fontStyle: 'normal' });
    } else {
      console.log('No text to save - empty input');
    }
  };

  const updateSelectedRectangle = (property, value) => {
    if (selectedElement && selectedElement.type === 'rectangle') {
      setRectangles(prev => prev.map((rect, index) => 
        index === selectedElement.index 
          ? { ...rect, [property]: value }
          : rect
      ));
    }
  };

  const updateSelectedText = (property, value) => {
    if (selectedElement && selectedElement.type === 'text') {
      setTexts(prev => prev.map((text, index) => 
        index === selectedElement.index 
          ? { ...text, style: { ...text.style, [property]: value } }
          : text
      ));
    }
  };

  const exportCanvas = () => {
    // Create a temporary canvas with export dimensions
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = EXPORT_WIDTH;
    exportCanvas.height = EXPORT_HEIGHT;
    const ctx = exportCanvas.getContext('2d');
    
    const scaleX = EXPORT_WIDTH / DISPLAY_WIDTH;
    const scaleY = EXPORT_HEIGHT / DISPLAY_HEIGHT;
    
    const exportBgStyle = parseCanvasGradient(ctx, backgroundConfig, EXPORT_WIDTH, EXPORT_HEIGHT);
    ctx.fillStyle = exportBgStyle;
    ctx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
    
    images.forEach(img => {
      if (img.element && img.element.complete) {
        ctx.drawImage(
          img.element,
          img.x * scaleX,
          img.y * scaleY,
          img.width * scaleX,
          img.height * scaleY
        );
      }
    });
    
    // Draw rectangles before text for correct layering in export
    rectangles.forEach(rectEl => {
      // Draw rectangle on export canvas
      ctx.fillStyle = rectEl.backgroundColor;
      ctx.strokeStyle = rectEl.borderColor;
      ctx.lineWidth = rectEl.borderWidth * scaleX; // Scale border width too

      const scaledX = rectEl.x * scaleX;
      const scaledY = rectEl.y * scaleY;
      const scaledW = rectEl.width * scaleX;
      const scaledH = rectEl.height * scaleY;
      const scaledR = rectEl.borderRadius * scaleX; // Scale border radius

      ctx.beginPath();
      if (scaledR > 0) {
        ctx.moveTo(scaledX + scaledR, scaledY);
        ctx.arcTo(scaledX + scaledW, scaledY, scaledX + scaledW, scaledY + scaledH, scaledR);
        ctx.arcTo(scaledX + scaledW, scaledY + scaledH, scaledX, scaledY + scaledH, scaledR);
        ctx.arcTo(scaledX, scaledY + scaledH, scaledX, scaledY, scaledR);
        ctx.arcTo(scaledX, scaledY, scaledX + scaledW, scaledY, scaledR);
      } else {
        ctx.rect(scaledX, scaledY, scaledW, scaledH);
      }
      ctx.closePath();
      
      if (rectEl.backgroundColor && rectEl.backgroundColor !== 'transparent') { // check for transparent
        ctx.fill();
      }
      if (rectEl.borderWidth > 0 && rectEl.borderColor) {
        ctx.stroke();
      }
    });

    // Draw texts last to ensure they are on top in export
    texts.forEach(text => {
      ctx.font = `${text.style.fontStyle} ${text.style.fontWeight} ${text.style.fontSize * scaleX}px ${text.style.fontFamily}`;
      ctx.fillStyle = text.style.color;
      ctx.fillText(text.content, text.x * scaleX, text.y * scaleY);
    });
    
    const link = document.createElement('a');
    link.download = `thumbnail_384x128.${exportFormat}`;
    
    let finalDataUrl;
    if (exportFormat === 'png') {
      finalDataUrl = exportCanvas.toDataURL('image/png');
    } else {
      finalDataUrl = exportCanvas.toDataURL('image/jpeg');
    }

    if (finalDataUrl) {
      const dpi = parseInt(exportPpi, 10) || 72;
      link.href = changeDpiDataUrl(finalDataUrl, dpi);
    } else {
      return; // Fallback if data URL creation failed (should not happen with PNG/JPEG)
    }
    
    link.click();
  };

  const clearCanvas = () => {
    setImages([]);
    setTexts([]);
    setRectangles([]);
    setSelectedElement(null);
  };

  const deleteSelected = () => {
    if (selectedElement) {
      if (selectedElement.type === 'image') {
        setImages(prev => prev.filter((_, index) => index !== selectedElement.index));
      } else if (selectedElement.type === 'text') {
        setTexts(prev => prev.filter((_, index) => index !== selectedElement.index));
      } else if (selectedElement.type === 'rectangle') {
        setRectangles(prev => prev.filter((_, index) => index !== selectedElement.index));
      }
      setSelectedElement(null);
    }
  };

  const PreviewDisplay = React.memo(({ images, texts, rectangles, backgroundConfig }) => {
    const previewCanvasRef = useRef(null);

    useEffect(() => {
      let isMounted = true; // Flag to track mounted status for async operations
      const canvas = previewCanvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      const taxiImg = new Image();
      
      taxiImg.onload = () => {
        if (!isMounted) return; // Don't proceed if component unmounted or effect re-ran

        // --- Stage 1: Draw the taxi image --- 
        const canvasWidth = canvas.width; // 400
        const canvasHeight = canvas.height; // 300
        const taxiNaturalWidth = taxiImg.naturalWidth;
        const taxiNaturalHeight = taxiImg.naturalHeight;

        let drawWidth = taxiNaturalWidth;
        let drawHeight = taxiNaturalHeight;
        let drawX = 0;
        let drawY = 0;

        // Calculate dimensions to fit taxi image into canvas while maintaining aspect ratio
        const taxiAspectRatio = taxiNaturalWidth / taxiNaturalHeight;
        const canvasAspectRatio = canvasWidth / canvasHeight;

        if (taxiAspectRatio > canvasAspectRatio) { // Taxi is wider than canvas area
          drawWidth = canvasWidth;
          drawHeight = canvasWidth / taxiAspectRatio;
          drawX = 0;
          drawY = (canvasHeight - drawHeight) / 2; // Center vertically
        } else { // Taxi is taller than or same aspect as canvas area
          drawHeight = canvasHeight;
          drawWidth = canvasHeight * taxiAspectRatio;
          drawY = 0;
          drawX = (canvasWidth - drawWidth) / 2; // Center horizontally
        }

        // Clear canvas and draw the taxi image
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.fillStyle = '#CCCCCC';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.drawImage(taxiImg, drawX, drawY, drawWidth, drawHeight);
        
        // --- Stage 2: Define ad panel ---
        const userOrigAdX = 25; 
        const userOrigAdY = 35;
        const userOrigAdW = 384 / 1.3;
        const userOrigAdH = 128 / 1.3;

        // Calculate scaling factors from original taxi image to its drawn size on canvas
        const scaleXToCanvas = drawWidth / taxiNaturalWidth;
        const scaleYToCanvas = drawHeight / taxiNaturalHeight;

        // Calculate the ad panel's position and size on the canvas
        const panelOnCanvasX = drawX + userOrigAdX * scaleXToCanvas;
        const panelOnCanvasY = drawY + userOrigAdY * scaleYToCanvas;
        const panelOnCanvasW = userOrigAdW * scaleXToCanvas;
        const panelOnCanvasH = userOrigAdH * scaleYToCanvas;

        // --- Stage 3: Create and draw the 3:1 thumbnail --- 
        const thumbnailCanvas = document.createElement('canvas');
        thumbnailCanvas.width = EXPORT_WIDTH; // e.g., 384
        thumbnailCanvas.height = EXPORT_HEIGHT; // e.g., 128 (maintaining 3:1)
        const thumbCtx = thumbnailCanvas.getContext('2d');
        
        const exportScaleX = EXPORT_WIDTH / DISPLAY_WIDTH;
        const exportScaleY = EXPORT_HEIGHT / DISPLAY_HEIGHT;
        
        // Background for thumbnail in preview
        const thumbBgStyle = parseCanvasGradient(thumbCtx, backgroundConfig, EXPORT_WIDTH, EXPORT_HEIGHT);
        thumbCtx.fillStyle = thumbBgStyle;
        thumbCtx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
        
        images.forEach(img => {
          if (img.element && img.element.complete) {
            thumbCtx.drawImage(
              img.element,
              img.x * exportScaleX,
              img.y * exportScaleY,
              img.width * exportScaleX,
              img.height * exportScaleY
            );
          }
        });
        
        // Draw rectangles before text
        rectangles.forEach(rectEl => {
          thumbCtx.fillStyle = rectEl.backgroundColor;
          thumbCtx.strokeStyle = rectEl.borderColor;
          thumbCtx.lineWidth = rectEl.borderWidth * exportScaleX;
          
          const scaledX = rectEl.x * exportScaleX;
          const scaledY = rectEl.y * exportScaleY;
          const scaledW = rectEl.width * exportScaleX;
          const scaledH = rectEl.height * exportScaleY;
          const scaledR = rectEl.borderRadius * exportScaleX;

          thumbCtx.beginPath();
          if (scaledR > 0) {
            thumbCtx.moveTo(scaledX + scaledR, scaledY);
            thumbCtx.arcTo(scaledX + scaledW, scaledY, scaledX + scaledW, scaledY + scaledH, scaledR);
            thumbCtx.arcTo(scaledX + scaledW, scaledY + scaledH, scaledX, scaledY + scaledH, scaledR);
            thumbCtx.arcTo(scaledX, scaledY + scaledH, scaledX, scaledY, scaledR);
            thumbCtx.arcTo(scaledX, scaledY, scaledX + scaledW, scaledY, scaledR);
          } else {
            thumbCtx.rect(scaledX, scaledY, scaledW, scaledH);
          }
          thumbCtx.closePath();
          
          if (rectEl.backgroundColor && rectEl.backgroundColor !== 'transparent') {
            thumbCtx.fill();
          }
          if (rectEl.borderWidth > 0 && rectEl.borderColor) {
            thumbCtx.stroke();
          }
        });

        // Draw texts last to ensure they are on top
        texts.forEach(text => {
          thumbCtx.font = `${text.style.fontStyle} ${text.style.fontWeight} ${text.style.fontSize * exportScaleX}px ${text.style.fontFamily}`;
          thumbCtx.fillStyle = text.style.color;
          thumbCtx.fillText(text.content, text.x * exportScaleX, text.y * exportScaleY);
        });

        // --- Stage 4: Fit and draw the 3:1 thumbnail into the calculated panelOnCanvas --- 
        const thumbnailAspectRatio = EXPORT_WIDTH / EXPORT_HEIGHT;

        let finalThumbDrawW = panelOnCanvasW;
        let finalThumbDrawH = panelOnCanvasW / thumbnailAspectRatio;

        if (finalThumbDrawH > panelOnCanvasH) {
          finalThumbDrawH = panelOnCanvasH;
          finalThumbDrawW = panelOnCanvasH * thumbnailAspectRatio;
        }

        const finalThumbDrawX = panelOnCanvasX + (panelOnCanvasW - finalThumbDrawW) / 2;
        const finalThumbDrawY = panelOnCanvasY + (panelOnCanvasH - finalThumbDrawH) / 2;
        
        // Draw the prepared 3:1 thumbnail onto the main preview canvas
        ctx.drawImage(thumbnailCanvas, finalThumbDrawX, finalThumbDrawY, finalThumbDrawW, finalThumbDrawH);

        // Draw a border around the ad panel on the taxi image
        ctx.strokeStyle = '#2563eb'; // blue-600 from Tailwind
        ctx.lineWidth = 2; // A visible line width
        ctx.strokeRect(finalThumbDrawX, finalThumbDrawY, finalThumbDrawW, finalThumbDrawH);
      };
      
      taxiImg.src = '/taxi.png';

      return () => {
        isMounted = false; // Cleanup: set flag to false when component unmounts or effect re-runs
      };
    }, [images, texts, rectangles, backgroundConfig]);

    return (
      <div className="p-4 bg-white rounded-lg shadow-md">
        <h3 className="mb-3 text-lg font-semibold text-center">Taxi Preview</h3>
        <div className="flex justify-center">
          <canvas
            ref={previewCanvasRef}
            width={400}
            height={300}
            className="rounded border border-gray-300"
          />
        </div>
        <p className="mt-2 text-xs text-center text-gray-500">
          Preview of your thumbnail on <a href="https://www.nytaxiads.com/spec" target="_blank" className='text-yellow-500 underline'>NYC taxi</a> (partner)
        </p>
      </div>
    );
  });

  return (
    <div className="p-4 min-h-screen bg-gray-100">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-8 text-3xl font-bold text-center text-gray-800">
          Taxi Ad Editor
        </h1>
        
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main Editor */}
          <div className="lg:col-span-2">
            {/* Toolbar */}
            <div className="p-4 mb-6 bg-white rounded-lg shadow-md">
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedTool('select')}
                    className={`px-4 py-2 rounded-md transition-colors ${
                      selectedTool === 'select' 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Select
                  </button>
                  <button
                    onClick={() => setSelectedTool('text')}
                    className={`px-4 py-2 rounded-md transition-colors ${
                      selectedTool === 'text' 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Add Text
                  </button>
                  <button
                    onClick={() => setSelectedTool('rectangle')}
                    className={`px-4 py-2 rounded-md transition-colors ${
                      selectedTool === 'rectangle' 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Add Rectangle
                  </button>
                </div>
                
                <div className="w-px h-6 bg-gray-300"></div>
                
                <div className="flex gap-2 items-center">
                  <label className="text-sm font-medium text-gray-700">Export:</label>
                  <select
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value)}
                    className="px-3 py-1 text-sm rounded-md border border-gray-300"
                  >
                    <option value="png">PNG</option>
                    <option value="jpeg">JPEG</option>
                  </select>
                </div>

                <div className="w-px h-6 bg-gray-300"></div>

                <div className="flex gap-2 items-center">
                  <label htmlFor="exportPpiInput" className="text-sm font-medium text-gray-700">PPI:</label>
                  <input
                    type="number"
                    id="exportPpiInput"
                    value={exportPpi}
                    onChange={(e) => setExportPpi(parseInt(e.target.value, 10) || 0)}
                    className="px-2 py-1 w-20 text-sm text-center rounded-md border border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                    min="72" 
                  />
                </div>
                
                <div className="w-px h-6 bg-gray-300"></div>

                <div className="flex gap-2 items-center">
                  <label htmlFor="bgColorPicker" className="text-sm font-medium text-gray-700">BG Color:</label>
                  <input 
                    type="color" 
                    id="bgColorPicker"
                    value={backgroundConfig.type === 'solid' ? backgroundConfig.colors[0].color : '#ffffff'}
                    onChange={(e) => {
                      setBackgroundConfig(prev => ({
                        ...prev,
                        type: 'solid',
                        colors: [{ ...prev.colors[0], color: e.target.value, stop:0 }]
                      }));
                    }}
                    className="p-0 w-8 h-8 rounded-md border border-gray-300 cursor-pointer"
                    title="Select solid background color"
                    disabled={backgroundConfig.type !== 'solid'}
                  />
                </div>
                
                <div className="flex gap-2 mr-auto">
                  <button
                    onClick={deleteSelected}
                    disabled={!selectedElement}
                    className={`px-4 py-2 rounded-md transition-colors ${
                      selectedElement 
                        ? 'text-white bg-red-500 hover:bg-red-600' 
                        : 'text-gray-500 bg-gray-300 cursor-not-allowed'
                    }`}
                  >
                    Delete Selected
                  </button>
                  <button
                    onClick={clearCanvas}
                    className="px-4 py-2 text-white bg-gray-500 rounded-md transition-colors hover:bg-gray-600"
                  >
                    Clear All
                  </button>
                  <button
                    onClick={exportCanvas}
                    className="px-4 py-2 text-white bg-green-500 rounded-md transition-colors hover:bg-green-600"
                  >
                    Export 384×128 ({exportPpi} PPI)
                  </button>
                </div>

                <div className="flex gap-2 items-center w-full">
                  <label htmlFor="bgTypePicker" className="text-sm font-medium text-gray-700">BG Type:</label>
                  <select
                    id="bgTypePicker"
                    value={backgroundConfig.type}
                    onChange={(e) => {
                      const newType = e.target.value;
                      setBackgroundConfig(prev => ({
                        ...prev,
                        type: newType,
                        // Reset colors or angle based on type? For now, keep them.
                        // If switching to solid, ensure first color is primary.
                        colors: newType === 'solid' && prev.colors.length === 0 ? 
                                [{ id: Date.now(), color: '#ffffff', stop: 0 }] : 
                                (newType === 'solid' && prev.colors.length > 0 ? 
                                  [{ ...prev.colors[0], stop:0 }] : prev.colors),
                      }));
                    }}
                    className="px-3 py-1 text-sm rounded-md border border-gray-300"
                  >
                    <option value="solid">Solid Color</option>
                    <option value="linear">Linear Gradient</option>
                    <option value="radial">Radial Gradient</option>
                  </select>
                </div>

                {/* Dynamic controls for Linear Gradient */} 
                {backgroundConfig.type === 'linear' && (
                  <div className="p-2 mt-2 space-y-2 rounded-md border">
                    <div className="flex gap-2 items-center">
                      <label className="text-xs">Angle:</label>
                      <input 
                        type="number" 
                        value={backgroundConfig.angle}
                        onChange={e => setBackgroundConfig(prev => ({...prev, angle: parseInt(e.target.value) || 0}))}
                        className="px-1 py-0.5 w-20 text-xs rounded border"
                      />
                    </div>
                    <div className="mb-1 text-xs">Color Stops:</div>
                    {backgroundConfig.colors.map((stop, index) => (
                      <div key={stop.id || index} className="flex gap-1 items-center">
                        <input 
                          type="color" 
                          value={stop.color}
                          onChange={e => {
                            const newColors = [...backgroundConfig.colors];
                            newColors[index] = {...newColors[index], color: e.target.value};
                            setBackgroundConfig(prev => ({...prev, colors: newColors}));
                          }}
                          className="p-0 w-6 h-6 rounded border"
                        />
                        <input 
                          type="number" 
                          min="0" max="100" step="1"
                          value={stop.stop}
                          onChange={e => {
                            const newColors = [...backgroundConfig.colors];
                            newColors[index] = {...newColors[index], stop: parseInt(e.target.value)};
                            setBackgroundConfig(prev => ({...prev, colors: newColors}));
                          }}
                          className="px-1 py-0.5 w-12 text-xs rounded border"
                        />
                        <span>%</span>
                        {backgroundConfig.colors.length > 1 && (
                           <button 
                            onClick={() => {
                              const newColors = backgroundConfig.colors.filter((_, i) => i !== index);
                              setBackgroundConfig(prev => ({...prev, colors: newColors.length > 0 ? newColors : initialBackgroundConfig.colors})); // Ensure at least one color stop or reset
                            }}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <button 
                      onClick={() => {
                        const newStopPosition = backgroundConfig.colors.length > 0 ? 
                                                Math.min(100, (backgroundConfig.colors[backgroundConfig.colors.length-1].stop || 0) + 10) :
                                                0;
                        setBackgroundConfig(prev => ({
                          ...prev, 
                          colors: [...prev.colors, {id: Date.now(), color: '#000000', stop: newStopPosition}]
                        }));
                      }}
                      className="px-2 py-0.5 text-xs text-white bg-blue-500 rounded hover:bg-blue-600"
                    >
                      Add Color Stop
                    </button>
                  </div>
                )}
                
                {/* Dynamic controls for Radial Gradient */} 
                {backgroundConfig.type === 'radial' && (
                  <div className="p-2 mt-2 space-y-2 rounded-md border">
                    <div className="grid grid-cols-2 gap-y-1 gap-x-2">
                      <div>
                        <label className="text-xs">Shape:</label>
                        <select 
                          value={backgroundConfig.radialShape}
                          onChange={e => setBackgroundConfig(prev => ({...prev, radialShape: e.target.value}))}
                          className="px-1 py-0.5 w-full text-xs rounded border"
                        >
                          <option value="ellipse">Ellipse</option>
                          <option value="circle">Circle</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs">Extent:</label>
                        <select 
                          value={backgroundConfig.radialExtent}
                          onChange={e => setBackgroundConfig(prev => ({...prev, radialExtent: e.target.value}))}
                          className="px-1 py-0.5 w-full text-xs rounded border"
                        >
                          <option value="farthest-corner">Farthest Corner</option>
                          <option value="farthest-side">Farthest Side</option>
                          <option value="closest-corner">Closest Corner</option>
                          <option value="closest-side">Closest Side</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs">Center X (%):</label>
                        <input 
                          type="text" // Using text to allow % sign, parsing will be needed
                          value={backgroundConfig.radialCenterX}
                          onChange={e => setBackgroundConfig(prev => ({...prev, radialCenterX: e.target.value}))}
                          className="px-1 py-0.5 w-full text-xs rounded border"
                          placeholder="e.g. 50%"
                        />
                      </div>
                      <div>
                        <label className="text-xs">Center Y (%):</label>
                        <input 
                          type="text" 
                          value={backgroundConfig.radialCenterY}
                          onChange={e => setBackgroundConfig(prev => ({...prev, radialCenterY: e.target.value}))}
                          className="px-1 py-0.5 w-full text-xs rounded border"
                          placeholder="e.g. 50%"
                        />
                      </div>
                    </div>
                    <div className="pt-1 mt-2 mb-1 text-xs border-t">Color Stops:</div>
                    {backgroundConfig.colors.map((stop, index) => (
                      <div key={stop.id || index} className="flex gap-1 items-center">
                        <input 
                          type="color" 
                          value={stop.color}
                          onChange={e => {
                            const newColors = [...backgroundConfig.colors];
                            newColors[index] = {...newColors[index], color: e.target.value};
                            setBackgroundConfig(prev => ({...prev, colors: newColors}));
                          }}
                          className="p-0 w-6 h-6 rounded border"
                        />
                        <input 
                          type="number" 
                          min="0" max="100" step="1"
                          value={stop.stop}
                          onChange={e => {
                            const newColors = [...backgroundConfig.colors];
                            newColors[index] = {...newColors[index], stop: parseInt(e.target.value)};
                            setBackgroundConfig(prev => ({...prev, colors: newColors}));
                          }}
                          className="px-1 py-0.5 w-12 text-xs rounded border"
                        />
                        <span>%</span>
                        {backgroundConfig.colors.length > 1 && (
                           <button 
                            onClick={() => {
                              const newColors = backgroundConfig.colors.filter((_, i) => i !== index);
                              setBackgroundConfig(prev => ({...prev, colors: newColors.length > 0 ? newColors : initialBackgroundConfig.colors}));
                            }}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <button 
                      onClick={() => {
                        const newStopPosition = backgroundConfig.colors.length > 0 ? 
                                                Math.min(100, (backgroundConfig.colors[backgroundConfig.colors.length-1].stop || 0) + 10) :
                                                0;
                        setBackgroundConfig(prev => ({
                          ...prev, 
                          colors: [...prev.colors, {id: Date.now(), color: '#000000', stop: newStopPosition}]
                        }));
                      }}
                      className="px-2 py-0.5 mt-1 text-xs text-white bg-blue-500 rounded hover:bg-blue-600"
                    >
                      Add Color Stop
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Canvas Area */}
            <div className="p-6 bg-white rounded-lg shadow-md">
              <div className="mb-4 text-center">
                <p className="mb-2 text-sm text-gray-600">
                  Canvas: 768×256 (Display) → Export: 384×128 pixels | 
                  Drag images here or click "Add Text" to insert text
                </p>
              </div>
              
              <div className="flex justify-center">
                <div
                  className="p-4 rounded-lg border-2 border-gray-300 border-dashed transition-colors hover:border-gray-400"
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                >
                  <canvas
                    ref={canvasRef}
                    width={DISPLAY_WIDTH}
                    height={DISPLAY_HEIGHT}
                    className="bg-white border border-gray-400 cursor-crosshair"
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    onMouseLeave={handleCanvasMouseUp}
                    onDoubleClick={handleCanvasDoubleClick}
                  />
                  {editingTextIndex !== null && texts[editingTextIndex] && (
                    <InlineTextEditor
                      textElement={texts[editingTextIndex]}
                      value={inlineInputValue}
                      onChange={(newValue) => {
                        setInlineInputValue(newValue);
                        setTexts(prevTexts =>
                          prevTexts.map((txt, idx) =>
                            idx === editingTextIndex ? { ...txt, content: newValue } : txt
                          )
                        );
                      }}
                      onStyleChange={(property, Pvalue) => {
                        // This would be triggered if InlineTextEditor had its own style controls
                        // For now, sidebar controls call updateSelectedText directly
                      }}
                      onCommit={() => setEditingTextIndex(null)}
                      canvasRef={canvasRef}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            {/* Preview Display */}
            <PreviewDisplay images={images} texts={texts} rectangles={rectangles} backgroundConfig={backgroundConfig} />

            {/* Text Edit Controls */}
            {selectedElement && selectedElement.type === 'text' && (
              <div className="p-4 bg-white rounded-lg shadow-md text-style-control-panel">
                <h3 className="mb-4 text-lg font-semibold">Edit Text</h3>
                
                <div className="space-y-4">
                  {/* Font Size */}
                  <div>
                    <label className="block mb-1 text-sm font-medium text-gray-700">Font Size</label>
                    <div className="flex gap-3 items-center">
                      <input
                        type="range"
                        min="8"
                        max="72"
                        value={texts[selectedElement.index]?.style.fontSize || 24}
                        onChange={(e) => updateSelectedText('fontSize', parseInt(e.target.value))}
                        className="w-full h-5 cursor-pointer accent-blue-500"
                      />
                      <input
                        type="number"
                        min="8"
                        max="72"
                        value={texts[selectedElement.index]?.style.fontSize || 24}
                        onChange={(e) => updateSelectedText('fontSize', parseInt(e.target.value))}
                        className="px-2 py-1 w-20 text-sm text-center rounded-md border border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* Font Family */} 
                  <div>
                    <label htmlFor={`textFontFamily-${selectedElement.index}`} className="block mb-1 text-sm font-medium text-gray-700">Font Family</label>
                    <select
                      id={`textFontFamily-${selectedElement.index}`}
                      value={texts[selectedElement.index]?.style.fontFamily || 'Arial'}
                      onChange={(e) => updateSelectedText('fontFamily', e.target.value)}
                      className="px-3 py-2 w-full text-sm rounded-md border border-gray-300 cursor-pointer focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="Arial">Arial</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Helvetica">Helvetica</option>
                      <option value="Verdana">Verdana</option>
                      <option value="Impact">Impact</option>
                      <option value="Comic Sans MS">Comic Sans MS</option>
                    </select>
                  </div>
                  
                  {/* Color and Styles */}
                  <div className="grid grid-cols-[auto,1fr] gap-x-6 items-center">
                    {/* Column 1: Color Picker Area */} 
                    <div>
                      <label htmlFor={`textColorPicker-${selectedElement.index}`} className="block mb-1 text-sm font-medium text-gray-700">Color</label>
                      <input
                        id={`textColorPicker-${selectedElement.index}`}
                        type="color"
                        value={texts[selectedElement.index]?.style.color || '#000000'}
                        onChange={(e) => updateSelectedText('color', e.target.value)}
                        className="w-24 h-10 rounded-md border border-gray-300 cursor-pointer"
                      />
                    </div>
                    {/* Column 2: Style Toggles */} 
                    <div className="flex flex-col space-y-1.5">
                       {/* Invisible label for alignment with the "Color" label's vertical position */}
                      <label className="block invisible mb-1 text-sm font-medium text-gray-700">Style</label>
                      <label className="flex items-center text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={texts[selectedElement.index]?.style.fontWeight === 'bold'}
                          onChange={(e) => updateSelectedText('fontWeight', e.target.checked ? 'bold' : 'normal')}
                          className="mr-1.5 w-4 h-4 text-blue-600 rounded border-gray-300 cursor-pointer focus:ring-offset-0 focus:ring-2 focus:ring-blue-500"
                        />
                        Bold
                      </label>
                      <label className="flex items-center text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={texts[selectedElement.index]?.style.fontStyle === 'italic'}
                          onChange={(e) => updateSelectedText('fontStyle', e.target.checked ? 'italic' : 'normal')}
                          className="mr-1.5 w-4 h-4 text-blue-600 rounded border-gray-300 cursor-pointer focus:ring-offset-0 focus:ring-2 focus:ring-blue-500"
                        />
                        Italic
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Image Edit Controls */}
            {selectedElement && selectedElement.type === 'image' && (
              <div className="p-4 bg-white rounded-lg shadow-md">
                <h3 className="mb-4 text-lg font-semibold">Edit Image</h3>
                <div className="space-y-3">
                  <ul className="space-y-1 text-sm list-disc list-inside text-left text-gray-600">
                    <li>Drag corner handles to resize.</li>
                    <li>Hold <kbd className="px-1.5 py-0.5 text-xs font-semibold text-gray-800 bg-gray-100 rounded-sm border border-gray-300">Shift</kbd> to maintain aspect ratio with corner handles.</li>
                    <li>Drag edge handles to resize in one direction.</li>
                    <li>Drag image to reposition.</li>
                  </ul>
                  <button
                    onClick={() => {
                      if (!selectedElement || selectedElement.type !== 'image') return;
                      const img = images[selectedElement.index];
                      if (!img || typeof img.originalWidth !== 'number' || typeof img.originalHeight !== 'number' || img.originalHeight === 0) return;
                      const aspectRatio = img.originalWidth / img.originalHeight;
                      
                      // Prioritize maintaining height if width would become too small, and vice-versa.
                      // Or, if aspect ratio is extreme, it might try to make one dimension very large.
                      // Let's base it on the current height as a starting point, but ensure it doesn't go below min width.
                      let newHeight = img.height;
                      let newWidth = newHeight * aspectRatio;

                      if (newWidth < 20) { // If new width is too small
                        newWidth = 20;
                        newHeight = newWidth / aspectRatio;
                        if (newHeight < 20 && aspectRatio !== 0) { // If height also becomes too small, adjust based on original intent
                           newHeight = 20;
                           newWidth = newHeight * aspectRatio; // This might still be < 20 if AR is extreme
                           newWidth = Math.max(20, newWidth); // Final clamp
                        } else if (aspectRatio === 0) { // Avoid division by zero if originalHeight was 0
                           newHeight = Math.max(20, img.height); // Keep current height or min
                        }
                      }

                      if (newHeight < 20) {
                          newHeight = 20;
                          if(aspectRatio !== 0) newWidth = newHeight * aspectRatio;
                          else newWidth = Math.max(20, img.width); // Keep current width or min
                          newWidth = Math.max(20, newWidth); // Final clamp
                      }

                      setImages(prev => prev.map((image, index) => 
                        index === selectedElement.index 
                          ? { ...image, width: Math.max(20, newWidth), height: Math.max(20, newHeight) }
                          : image
                      ));
                    }}
                    className="px-4 py-2 w-full text-white bg-blue-500 rounded-md transition-colors hover:bg-blue-600"
                  >
                    Reset Aspect Ratio
                  </button>
                </div>
              </div>
            )}

            {/* Rectangle Edit Controls */}
            {selectedElement && selectedElement.type === 'rectangle' && (
              <div className="p-4 bg-white rounded-lg shadow-md">
                <h3 className="mb-4 text-lg font-semibold">Edit Rectangle</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                    <div>
                      <label className="block mb-1 text-sm font-medium text-gray-700">Background</label>
                      <input
                        type="color"
                        value={rectangles[selectedElement.index]?.backgroundColor || '#cccccc'}
                        onChange={(e) => updateSelectedRectangle('backgroundColor', e.target.value)}
                        className="px-1 py-1 w-full h-10 rounded-md border border-gray-300"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-sm font-medium text-gray-700">Border Color</label>
                      <input
                        type="color"
                        value={rectangles[selectedElement.index]?.borderColor || '#333333'}
                        onChange={(e) => updateSelectedRectangle('borderColor', e.target.value)}
                        className="px-1 py-1 w-full h-10 rounded-md border border-gray-300"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-sm font-medium text-gray-700">Border (px)</label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        value={rectangles[selectedElement.index]?.borderWidth || 0}
                        onChange={(e) => updateSelectedRectangle('borderWidth', parseInt(e.target.value) || 0)}
                        className="px-2 py-1 w-full text-sm rounded-md border border-gray-300"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-sm font-medium text-gray-700">Radius (px)</label>
                      <input
                        type="number"
                        min="0"
                        max="100" 
                        value={rectangles[selectedElement.index]?.borderRadius || 0}
                        onChange={(e) => updateSelectedRectangle('borderRadius', parseInt(e.target.value) || 0)}
                        className="px-2 py-1 w-full text-sm rounded-md border border-gray-300"
                      />
                    </div>
                  </div>

                  <div className="pt-3 mt-2 border-t">
                    <ul className="mb-3 space-y-1 text-sm list-disc list-inside text-left text-gray-600">
                      <li>Drag corner/edge handles to resize.</li>
                      <li>Drag rectangle to reposition.</li>
                    </ul>
                     <button
                      onClick={() => {
                        if (!selectedElement || selectedElement.type !== 'rectangle') return;
                        const rect = rectangles[selectedElement.index];
                        const aspectRatio = rect.originalWidth / rect.originalHeight;
                        // Choose the larger dimension to scale from to avoid making it too small initially
                        let newWidth, newHeight;
                        if (rect.width / aspectRatio <= rect.height) { // Current shape is taller or same as original aspect
                            newWidth = rect.height * aspectRatio;
                            newHeight = rect.height;
                        } else { // Current shape is wider than original aspect
                            newHeight = rect.width / aspectRatio;
                            newWidth = rect.width;
                        }
                        // Ensure minimum size for both dimensions after aspect ratio reset
                        newWidth = Math.max(20, newWidth);
                        newHeight = Math.max(20, newHeight);
                        if (newWidth / aspectRatio < 20) newHeight = 20 / aspectRatio;
                        if (newHeight * aspectRatio < 20) newWidth = 20 * aspectRatio;

                        updateSelectedRectangle('width', newWidth);
                        updateSelectedRectangle('height', newHeight);
                      }}
                      className="px-4 py-2 mt-2 w-full text-white bg-blue-500 rounded-md transition-colors hover:bg-blue-600"
                    >
                      Reset Aspect Ratio (to original drop size)
                    </button>
                  </div>

                </div>
              </div>
            )}

            {/* Element Info */}
            <div className="p-4 bg-white rounded-lg shadow-md">
              <h3 className="mb-3 text-lg font-semibold">Selection Info</h3>
              {selectedElement ? (
                <div className="text-sm text-gray-600">
                  <p>Type: {selectedElement.type}</p>
                  <p>Index: {selectedElement.index}</p>
                  {selectedElement.type === 'text' && (
                    <p>Content: "{texts[selectedElement.index]?.content}"</p>
                  )}
                  {selectedElement.type === 'rectangle' && (
                    <>
                      <p>Bg: {rectangles[selectedElement.index]?.backgroundColor}</p>
                      <p>Border: {rectangles[selectedElement.index]?.borderColor} ({rectangles[selectedElement.index]?.borderWidth}px)</p>
                      <p>Radius: {rectangles[selectedElement.index]?.borderRadius}px</p>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No element selected</p>
              )}
            </div>
          </div>
        </div>

        {/* Text Dialog */}
        {showTextDialog && (
          <div 
            className="flex fixed inset-0 z-50 justify-center items-center bg-black bg-opacity-50"
            onClick={(e) => {
              // Only close if clicking the backdrop, not the modal content
              if (e.target === e.currentTarget) {
                setShowTextDialog(false);
                setEditingTextIndex(null);
              }
            }}
          >
            <div 
              className="relative p-6 w-96 bg-white rounded-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-4 text-lg font-semibold">Add Text</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block mb-1 text-sm font-medium text-gray-700">Text:</label>
                  <input
                    type="text"
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    placeholder="Enter your text..."
                    className="px-3 py-2 w-full rounded-md border border-gray-300"
                    autoFocus
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1 text-sm font-medium text-gray-700">Font Size:</label>
                    <input
                      type="number"
                      value={textStyle.fontSize}
                      onChange={(e) => setTextStyle(prev => ({ ...prev, fontSize: parseInt(e.target.value) }))}
                      min="8"
                      max="72"
                      className="px-3 py-2 w-full rounded-md border border-gray-300"
                    />
                  </div>
                  
                  <div>
                    <label className="block mb-1 text-sm font-medium text-gray-700">Color:</label>
                    <input
                      type="color"
                      value={textStyle.color}
                      onChange={(e) => setTextStyle(prev => ({ ...prev, color: e.target.value }))}
                      className="px-3 py-2 w-full h-10 rounded-md border border-gray-300"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block mb-1 text-sm font-medium text-gray-700">Font Family:</label>
                  <select
                    value={textStyle.fontFamily}
                    onChange={(e) => setTextStyle(prev => ({ ...prev, fontFamily: e.target.value }))}
                    className="px-3 py-2 w-full rounded-md border border-gray-300"
                  >
                    <option value="Arial">Arial</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Helvetica">Helvetica</option>
                    <option value="Verdana">Verdana</option>
                    <option value="Impact">Impact</option>
                    <option value="Comic Sans MS">Comic Sans MS</option>
                  </select>
                </div>
                
                <div className="flex gap-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={textStyle.fontWeight === 'bold'}
                      onChange={(e) => setTextStyle(prev => ({ 
                        ...prev, 
                        fontWeight: e.target.checked ? 'bold' : 'normal' 
                      }))}
                      className="mr-2"
                    />
                    Bold
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={textStyle.fontStyle === 'italic'}
                      onChange={(e) => setTextStyle(prev => ({ 
                        ...prev, 
                        fontStyle: e.target.checked ? 'italic' : 'normal' 
                      }))}
                      className="mr-2"
                    />
                    Italic
                  </label>
                </div>
              </div>
              
              <div className="flex gap-2 justify-end mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowTextDialog(false);
                    setEditingTextIndex(null);
                  }}
                  className="px-4 py-2 text-gray-600 rounded-md border border-gray-300 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveText}
                  className="px-4 py-2 text-white bg-blue-500 rounded-md hover:bg-blue-600"
                >
                  {/* Dialog is now only for adding new text */}
                  Add Text
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const InlineTextEditor = ({ textElement, value, onChange, onCommit, canvasRef }) => {
  const inputRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [style, setStyle] = useState({});
  const [isReadyToRender, setIsReadyToRender] = useState(false);
  const lastSelectedIdRef = useRef(null);

  const measureTextMetrics = (text, fontString) => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return { width: 0, ascent: 0, descent: 0 };
    context.font = fontString;
    const metrics = context.measureText(text);
    const ascent = (typeof metrics.actualBoundingBoxAscent === 'number' && isFinite(metrics.actualBoundingBoxAscent)) 
                   ? metrics.actualBoundingBoxAscent 
                   : parseFloat(fontString.match(/(\d+)px/)?.[1] || '0') * 0.8; // Fallback to 80% of fontSize
    const descent = (typeof metrics.actualBoundingBoxDescent === 'number' && isFinite(metrics.actualBoundingBoxDescent)) 
                    ? metrics.actualBoundingBoxDescent 
                    : parseFloat(fontString.match(/(\d+)px/)?.[1] || '0') * 0.2; // Fallback to 20% of fontSize
    return {
      width: metrics.width,
      ascent: ascent,
      descent: descent,
    };
  };

  useEffect(() => {
    if (textElement && canvasRef.current) {
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const textStyle = textElement.style;
      const fullFontString = `${textStyle.fontStyle} ${textStyle.fontWeight} ${textStyle.fontSize}px ${textStyle.fontFamily}`;

      const metrics = measureTextMetrics(value || ' ', fullFontString);
      const boxHeight = metrics.ascent + metrics.descent;
      const topPosition = textElement.y - metrics.ascent;

      // Define padding values
      const horizontalPadding = 5; // 5px on left and right
      const verticalPadding = 1;   // 1px on top and bottom

      setPosition({
        // Adjust left and top position to account for the INSET border of the input
        // The border is 1px, so we shift slightly to align the *inside* of the input with canvas text
        top: canvasRect.top + topPosition - verticalPadding - 1, // -1 for top border
        left: canvasRect.left + textElement.x - horizontalPadding - 1, // -1 for left border
      });

      setStyle({
        position: 'absolute',
        zIndex: 100,
        fontFamily: textStyle.fontFamily,
        fontSize: `${textStyle.fontSize}px`,
        color: textStyle.color,
        fontWeight: textStyle.fontWeight,
        fontStyle: textStyle.fontStyle,
        lineHeight: `${boxHeight}px`, // Text itself is aligned using this
        height: `${boxHeight + (2 * verticalPadding)}px`,    // Total height including vertical padding
        width: `${metrics.width + (2 * horizontalPadding)}px`, // Total width including horizontal padding
        background: 'rgba(255, 255, 255, 0.9)',
        border: '1px dashed #2563eb',
        padding: `${verticalPadding}px ${horizontalPadding}px`, // Apply padding
        margin: '0',
        boxSizing: 'border-box',
        outline: 'none',
        textAlign: 'left',
      });
      setIsReadyToRender(true); // Ready to render after calculations

      if (inputRef.current) {
        inputRef.current.focus();
        if (textElement.id !== lastSelectedIdRef.current) {
          inputRef.current.select();
          lastSelectedIdRef.current = textElement.id;
        }
      }
    } else {
      lastSelectedIdRef.current = null;
    }
  // Dependencies now include all style properties that affect geometry or appearance
  }, [textElement, canvasRef, value, 
      textElement?.style.fontFamily, textElement?.style.fontSize, textElement?.style.color, 
      textElement?.style.fontWeight, textElement?.style.fontStyle]);

  const handleInputChange = (e) => {
    onChange(e.target.value);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setIsReadyToRender(false);
      onCommit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsReadyToRender(false);
      onCommit();
    }
  };

  const handleBlur = (e) => {
    const newFocusTarget = e.relatedTarget;
    if (newFocusTarget && newFocusTarget.closest && newFocusTarget.closest('.text-style-control-panel')) {
      return;
    }
    setIsReadyToRender(false);
    onCommit();
  };
  
  // Do not render until calculations are done and textElement is present
  if (!isReadyToRender || !textElement) {
    // When hiding, ensure isReadyToRender is false for the *next* time it might appear
    // This is mostly handled by onCommit/onBlur setting it false, but good to be defensive.
    if (isReadyToRender && !textElement && inputRef.current) {
        // This case should ideally not happen if parent manages textElement correctly with editingTextIndex
    }
    return null;
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={handleInputChange}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      style={{ ...style, top: `${position.top}px`, left: `${position.left}px` }}
      autoFocus
    />
  );
};

function App() {
  return (
    <div className="App">
      <ThumbnailEditor />
    </div>
  );
}

export default App;
