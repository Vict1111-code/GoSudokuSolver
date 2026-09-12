document.getElementById('undo').onclick=()=>{if(!undoStack.length)return;redoStack.push(snapshot());restore(undoStack.pop());updateStats();saveGame(true);message.textContent='↶ Undo';};
document.getElementById('redo').onclick=()=>{if(!redoStack.length)return;undoStack.push(snapshot());restore(redoStack.pop());updateStats();saveGame(true);message.textContent='↷ Redo';};
document.getElementById('timeUpClose').onclick=()=>{document.getElementById('timeUpOverlay').classList.remove('show');speedRun();};
