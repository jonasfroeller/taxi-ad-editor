import React, { useState, useRef, useEffect } from 'react';
import './App.css';

const ThumbnailEditor = () => {
  const canvasRef = useRef(null);
  const [images, setImages] = useState([]);
  const [texts, setTexts] = useState([]);
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

  // Canvas dimensions - display size (3:1 ratio)
  const DISPLAY_WIDTH = 768;
  const DISPLAY_HEIGHT = 256;
  
  // Export dimensions
  const EXPORT_WIDTH = 384;
  const EXPORT_HEIGHT = 128;

  useEffect(() => {
    redrawCanvas();
  }, [images, texts, selectedElement]);

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

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    console.log('Redrawing canvas with texts:', texts);
    
    ctx.clearRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
    ctx.fillStyle = '#ffffff';
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
    
    // Draw texts
    texts.forEach((text, index) => {
      console.log('Drawing text:', text.content, 'at position:', text.x, text.y);
      ctx.font = `${text.style.fontStyle} ${text.style.fontWeight} ${text.style.fontSize}px ${text.style.fontFamily}`;
      ctx.fillStyle = text.style.color;
      ctx.fillText(text.content, text.x, text.y);
      
      // Draw selection indicator for selected text
      if (selectedElement && selectedElement.type === 'text' && selectedElement.index === index) {
        const metrics = ctx.measureText(text.content);
        drawTextSelection(ctx, text.x, text.y - text.style.fontSize, metrics.width, text.style.fontSize);
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
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
    ctx.setLineDash([]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    
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
              x: (DISPLAY_WIDTH - width) / 2,
              y: (DISPLAY_HEIGHT - height) / 2,
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

    // Check if clicking on resize handle for selected image
    if (selectedElement && selectedElement.type === 'image') {
      const img = images[selectedElement.index];
      const handle = getResizeHandle(x, y, img);
      if (handle) {
        setIsResizing(true);
        setResizeHandle(handle);
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

    // Check if clicking on text
    for (let i = texts.length - 1; i >= 0; i--) {
      const text = texts[i];
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.font = `${text.style.fontStyle} ${text.style.fontWeight} ${text.style.fontSize}px ${text.style.fontFamily}`;
      const metrics = ctx.measureText(text.content);
      
      if (x >= text.x && x <= text.x + metrics.width && 
          y >= text.y - text.style.fontSize && y <= text.y) {
        setSelectedElement({ type: 'text', index: i });
        setDraggedElement({ type: 'text', index: i });
        setDragOffset({ x: x - text.x, y: y - text.y });
        setIsDragging(true);
        return;
      }
    }

    // Clear selection if clicking empty area
    setSelectedElement(null);

    // If no element clicked and text tool is selected, add text
    if (selectedTool === 'text') {
      setShowTextDialog(true);
      setNewText('');
    }
  };

  const handleCanvasMouseMove = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isResizing && selectedElement && selectedElement.type === 'image') {
      setImages(prevImgs => prevImgs.map((image, index) => {
        if (index === selectedElement.index) {
          let nX = image.x;
          let nY = image.y;
          let nW = image.width;
          let nH = image.height;
          const originalAspectRatio = image.originalWidth / image.originalHeight;

          // Store the image's state *before* this resize operation for anchor calculations.
          const currentImgX = image.x;
          const currentImgY = image.y;
          const currentImgW = image.width;
          const currentImgH = image.height;

          if (isShiftPressed && ['nw', 'ne', 'sw', 'se'].includes(resizeHandle)) {
            // Aspect ratio locked resize for corner handles
            switch (resizeHandle) {
              case 'se': { // Anchor: top-left
                const anchorX = currentImgX;
                const anchorY = currentImgY;
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
                const anchorX = currentImgX + currentImgW;
                const anchorY = currentImgY;
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
                const anchorX = currentImgX;
                const anchorY = currentImgY + currentImgH;
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
                const anchorX = currentImgX + currentImgW;
                const anchorY = currentImgY + currentImgH;
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
                    nX = currentImgX; nY = currentImgY;
                    break;
                case 'sw':
                    nX = (currentImgX + currentImgW) - nW; nY = currentImgY;
                    break;
                case 'ne':
                    nX = currentImgX; nY = (currentImgY + currentImgH) - nH;
                    break;
                case 'nw':
                    nX = (currentImgX + currentImgW) - nW; nY = (currentImgY + currentImgH) - nH;
                    break;
            }

          } else { // (no shift, or edge handles)
            switch (resizeHandle) {
              case 'se':
                nW = Math.max(20, x - currentImgX);
                nH = Math.max(20, y - currentImgY);
                break;
              case 'sw':
                nW = Math.max(20, currentImgX + currentImgW - x);
                nH = Math.max(20, y - currentImgY);
                nX = x;
                break;
              case 'ne':
                nW = Math.max(20, x - currentImgX);
                nH = Math.max(20, currentImgY + currentImgH - y);
                nY = y;
                break;
              case 'nw':
                nW = Math.max(20, currentImgX + currentImgW - x);
                nH = Math.max(20, currentImgY + currentImgH - y);
                nX = x;
                nY = y;
                break;
              case 'e':
                nW = Math.max(20, x - currentImgX);
                nH = currentImgH;
                nX = currentImgX;
                nY = currentImgY;
                break;
              case 'w':
                nW = Math.max(20, currentImgX + currentImgW - x);
                nX = x;
                nH = currentImgH;
                nY = currentImgY;
                break;
              case 'n':
                nH = Math.max(20, currentImgY + currentImgH - y);
                nY = y;
                nW = currentImgW;
                nX = currentImgX;
                break;
              case 's':
                nH = Math.max(20, y - currentImgY);
                nW = currentImgW;
                nX = currentImgX;
                nY = currentImgY;
                break;
            }
          }
          return { ...image, x: nX, y: nY, width: nW, height: nH };
        }
        return image;
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
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
    setDraggedElement(null);
    setIsResizing(false);
    setResizeHandle(null);
  };

  const addText = () => {
    console.log('addText function called!', newText.trim());
    if (newText.trim()) {
      const newTextObj = {
        id: Date.now() + Math.random(),
        content: newText,
        x: DISPLAY_WIDTH / 2 - 50,
        y: DISPLAY_HEIGHT / 2,
        style: { ...textStyle }
      };
      console.log('Adding text object:', newTextObj);
      setTexts(prev => {
        const updated = [...prev, newTextObj];
        console.log('Updated texts array:', updated);
        return updated;
      });
      setShowTextDialog(false);
      setNewText('');
    } else {
      console.log('No text to add - empty input');
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
    
    ctx.fillStyle = '#ffffff';
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
    
    texts.forEach(text => {
      ctx.font = `${text.style.fontStyle} ${text.style.fontWeight} ${text.style.fontSize * scaleX}px ${text.style.fontFamily}`;
      ctx.fillStyle = text.style.color;
      ctx.fillText(text.content, text.x * scaleX, text.y * scaleY);
    });
    
    const link = document.createElement('a');
    link.download = `thumbnail_384x128.${exportFormat}`;
    
    if (exportFormat === 'png') {
      link.href = exportCanvas.toDataURL('image/png');
    } else {
      link.href = exportCanvas.toDataURL('image/jpeg', 0.95);
    }
    
    link.click();
  };

  const clearCanvas = () => {
    setImages([]);
    setTexts([]);
    setSelectedElement(null);
  };

  const deleteSelected = () => {
    if (selectedElement) {
      if (selectedElement.type === 'image') {
        setImages(prev => prev.filter((_, index) => index !== selectedElement.index));
      } else if (selectedElement.type === 'text') {
        setTexts(prev => prev.filter((_, index) => index !== selectedElement.index));
      }
      setSelectedElement(null);
    }
  };

  const PreviewDisplay = () => {
    const previewCanvasRef = useRef(null);

    useEffect(() => {
      const canvas = previewCanvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      const taxiImg = new Image();
      
      taxiImg.onload = () => {
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
        
        thumbCtx.fillStyle = '#ffffff';
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
      };
      
      taxiImg.src = '/taxi.png';
    }, [images, texts]);

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
  };

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
                
                <div className="flex gap-2 ml-auto">
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
                    Export 384×128
                  </button>
                </div>
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
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            {/* Preview Display */}
            <PreviewDisplay />

            {/* Text Edit Controls */}
            {selectedElement && selectedElement.type === 'text' && (
              <div className="p-4 bg-white rounded-lg shadow-md">
                <h3 className="mb-3 text-lg font-semibold">Edit Text</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block mb-2 text-sm font-medium text-gray-700">Font Size</label>
                    <div className="space-y-2">
                      <input
                        type="range"
                        min="8"
                        max="72"
                        value={texts[selectedElement.index]?.style.fontSize || 24}
                        onChange={(e) => updateSelectedText('fontSize', parseInt(e.target.value))}
                        className="w-full"
                      />
                      <input
                        type="number"
                        min="8"
                        max="72"
                        value={texts[selectedElement.index]?.style.fontSize || 24}
                        onChange={(e) => updateSelectedText('fontSize', parseInt(e.target.value))}
                        className="px-3 py-2 w-full rounded-md border border-gray-300"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block mb-2 text-sm font-medium text-gray-700">Color</label>
                    <input
                      type="color"
                      value={texts[selectedElement.index]?.style.color || '#000000'}
                      onChange={(e) => updateSelectedText('color', e.target.value)}
                      className="px-3 py-2 w-full h-10 rounded-md border border-gray-300"
                    />
                  </div>
                  
                  <div>
                    <label className="block mb-2 text-sm font-medium text-gray-700">Font Family</label>
                    <select
                      value={texts[selectedElement.index]?.style.fontFamily || 'Arial'}
                      onChange={(e) => updateSelectedText('fontFamily', e.target.value)}
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
                        checked={texts[selectedElement.index]?.style.fontWeight === 'bold'}
                        onChange={(e) => updateSelectedText('fontWeight', e.target.checked ? 'bold' : 'normal')}
                        className="mr-2"
                      />
                      Bold
                    </label>
                    
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={texts[selectedElement.index]?.style.fontStyle === 'italic'}
                        onChange={(e) => updateSelectedText('fontStyle', e.target.checked ? 'italic' : 'normal')}
                        className="mr-2"
                      />
                      Italic
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Image Edit Controls */}
            {selectedElement && selectedElement.type === 'image' && (
              <div className="p-4 bg-white rounded-lg shadow-md">
                <h3 className="mb-3 text-lg font-semibold">Edit Image</h3>
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    • Drag corner handles to resize
                  </p>
                  <p className="text-sm text-gray-600">
                    • Drag edge handles to resize in one direction
                  </p>
                  <p className="text-sm text-gray-600">
                    • Drag image to reposition
                  </p>
                  <button
                    onClick={() => {
                      const img = images[selectedElement.index];
                      const aspectRatio = img.originalWidth / img.originalHeight;
                      setImages(prev => prev.map((image, index) => 
                        index === selectedElement.index 
                          ? { ...image, width: image.height * aspectRatio }
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
                  onClick={() => setShowTextDialog(false)}
                  className="px-4 py-2 text-gray-600 rounded-md border border-gray-300 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={addText}
                  className="px-4 py-2 text-white bg-blue-500 rounded-md hover:bg-blue-600"
                >
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

function App() {
  return (
    <div className="App">
      <ThumbnailEditor />
    </div>
  );
}

export default App;