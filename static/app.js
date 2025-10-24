const boardDiv = document.getElementById("board");
const message = document.getElementById("message");

for (let i = 0; i < 81; i++) {
  const input = document.createElement("input");
  input.maxLength = 1;
  boardDiv.appendChild(input);
}

document.getElementById("solve").onclick = async () => {
  const rows = [];
  for (let r = 0; r < 9; r++) {
    let row = "";
    for (let c = 0; c < 9; c++) {
      const val = boardDiv.children[r * 9 + c].value.trim();
      row += val === "" ? "." : val;
    }
    rows.push(row);
  }

  message.textContent = "Solving...";

  const res = await fetch("/solve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows }),
  });

  const data = await res.json();

  if (data.solved) {
    message.textContent = "✅ Solved!";
    const solvedBoard = data.board;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        boardDiv.children[r * 9 + c].value = solvedBoard[r][c];
      }
    }
  } else {
    message.textContent = "❌ " + data.error;
  }
};

document.getElementById("reset").onclick = () => {
  [...boardDiv.children].forEach(input => input.value = "");
  message.textContent = "";
};

document.getElementById("generate").onclick = async () => {
  message.textContent = "Generating puzzle...";
  const res = await fetch("/generate");
  const data = await res.json();

  const puzzle = data.puzzle;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = boardDiv.children[r * 9 + c];
      cell.value = puzzle[r][c] === 0 ? "" : puzzle[r][c];
    }
  }
  message.textContent = "🧩 Puzzle generated!";
};
