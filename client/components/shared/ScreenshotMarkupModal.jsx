const React = require('react');
const { useState, useEffect, useRef } = React;
const Icons = require('./Icons');
const { resizeImage } = require('../../utils/imageUtils');

const ScreenshotMarkupModal = ({ isOpen, onClose, onSave, initialImage }) => {
  const canvasRef = useRef(null);
  const textInputRef = useRef(null);
  const [currentTool, setCurrentTool] = useState('pen');
  const [currentColor, setCurrentColor] = useState('#ef4444');
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyStep, setHistoryStep] = useState(-1);
  const [textInput, setTextInput] = useState({ visible: false, x: 0, y: 0, value: '' });

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      const maxWidth = 900, maxHeight = 700;
      let width = img.width, height = img.height;
      if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth; }
      if (height > maxHeight) { width = (width * maxHeight) / height; height = maxHeight; }
      canvas.width = width; canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      saveState();
    };
    img.src = initialImage;
  }, [isOpen, initialImage]);

  const saveState = () => {
    if (!canvasRef.current) return;
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(canvasRef.current.toDataURL());
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  const undo = () => {
    if (historyStep > 0) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0); };
      img.src = history[historyStep - 1];
      setHistoryStep(historyStep - 1);
    }
  };

  const clearCanvas = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); saveState(); };
    img.src = initialImage;
  };

  useEffect(() => {
    if (textInput.visible && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [textInput.visible]);

  const commitText = () => {
    if (!textInput.visible) return;
    if (textInput.value.trim()) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.font = 'bold 18px Inter, sans-serif';
      ctx.fillStyle = currentColor;
      ctx.fillText(textInput.value, textInput.x, textInput.y + 18);
      saveState();
    }
    setTextInput({ visible: false, x: 0, y: 0, value: '' });
  };

  const startDrawing = (e) => {
    if (textInput.visible) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setIsDrawing(true);
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (currentTool === 'pen') { ctx.beginPath(); ctx.moveTo(x, y); }
    else if (currentTool === 'arrow') { canvas.dataset.startX = x; canvas.dataset.startY = y; }
    else if (currentTool === 'text') {
      setTextInput({ visible: true, x, y, value: '' });
      setIsDrawing(false);
    }
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ctx = canvas.getContext('2d');
    if (currentTool === 'pen') { ctx.lineTo(x, y); ctx.stroke(); }
  };

  const stopDrawing = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (currentTool === 'arrow') {
      const rect = canvas.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;
      const startX = parseFloat(canvas.dataset.startX);
      const startY = parseFloat(canvas.dataset.startY);
      const angle = Math.atan2(endY - startY, endX - startX);
      const headLength = 15;
      ctx.beginPath();
      ctx.moveTo(startX, startY); ctx.lineTo(endX, endY);
      ctx.lineTo(endX - headLength * Math.cos(angle - Math.PI / 6), endY - headLength * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - headLength * Math.cos(angle + Math.PI / 6), endY - headLength * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    }
    setIsDrawing(false);
    saveState();
  };

  const handleSave = async () => {
    if (!canvasRef.current) return;
    const resizedData = await resizeImage(canvasRef.current.toDataURL('image/png'));
    onSave(resizedData);
    onClose();
  };

  if (!isOpen) return null;

  const tools = [
    { id: 'pen', label: 'Pen' },
    { id: 'arrow', label: 'Arrow' },
    { id: 'text', label: 'Text' },
  ];

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-bg-surface border border-border rounded-xl max-w-[960px] w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-text-primary font-semibold">Annotate Screenshot</h3>
          <button className="text-text-secondary hover:text-text-primary transition-colors" onClick={onClose}>
            <Icons.X />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-4 px-6 py-3 border-b border-border">
          <div className="flex gap-1">
            {tools.map(tool => (
              <button
                key={tool.id}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  currentTool === tool.id ? 'bg-accent text-accent-text' : 'bg-bg-input text-text-secondary hover:text-text-primary'
                }`}
                onClick={() => setCurrentTool(tool.id)}
              >
                {tool.label}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-border"></div>

          <div className="flex gap-1.5">
            {['#ef4444', '#10b981', '#3b82f6', '#ffffff'].map(color => (
              <button
                key={color}
                className={`w-6 h-6 rounded-full border-2 transition-all ${
                  currentColor === color ? 'border-white scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: color }}
                onClick={() => setCurrentColor(color)}
              />
            ))}
          </div>

          <div className="h-5 w-px bg-border"></div>

          <button className="px-3 py-1.5 text-xs bg-bg-input text-text-secondary rounded-lg hover:text-text-primary disabled:opacity-30" onClick={undo} disabled={historyStep <= 0}>
            Undo
          </button>
          <button className="px-3 py-1.5 text-xs bg-bg-input text-text-secondary rounded-lg hover:text-text-primary" onClick={clearCanvas}>
            Clear
          </button>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-auto p-4 flex justify-center">
          <div className="relative" style={{ display: 'inline-block' }}>
            <canvas
              ref={canvasRef}
              className={`rounded-lg ${currentTool === 'text' ? 'cursor-text' : 'cursor-crosshair'}`}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
            />
            {textInput.visible && (
              <input
                ref={textInputRef}
                type="text"
                className="absolute bg-transparent border-none outline-none p-0 m-0"
                style={{
                  left: textInput.x,
                  top: textInput.y,
                  color: currentColor,
                  font: 'bold 18px Inter, sans-serif',
                  minWidth: 80,
                  width: Math.max(80, textInput.value.length * 11 + 20),
                  caretColor: currentColor,
                  textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                }}
                value={textInput.value}
                onChange={e => setTextInput(prev => ({ ...prev, value: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitText(); }
                  if (e.key === 'Escape') { setTextInput({ visible: false, x: 0, y: 0, value: '' }); }
                }}
                onBlur={commitText}
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <button className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors" onClick={onClose}>Cancel</button>
          <button className="px-4 py-2 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all" onClick={handleSave}>Save Screenshot</button>
        </div>
      </div>
    </div>
  );
};

module.exports = ScreenshotMarkupModal;
