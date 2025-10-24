package main

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"time"
)

type Request struct {
	Rows [9]string `json:"rows"`
}

type Response struct {
	Solved bool       `json:"solved"`
	Board  [9][9]int  `json:"board"`
	Error  string     `json:"error,omitempty"`
}

type PuzzleResponse struct {
	Puzzle [9][9]int `json:"puzzle"`
	Level  string    `json:"level"`
}

func main() {
	rand.Seed(time.Now().UnixNano())

	http.Handle("/", http.FileServer(http.Dir("./static")))
	http.HandleFunc("/solve", solveHandler)
	http.HandleFunc("/generate", generateHandler)

	fmt.Println("🚀 Sudoku Web Game running at http://localhost:8080")
	http.ListenAndServe(":8080", nil)
}

// --------------------------- SOLVER ----------------------------

func solveHandler(w http.ResponseWriter, r *http.Request) {
	var req Request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	var board [9][9]int
	for r := 0; r < 9; r++ {
		line := req.Rows[r]
		if len(line) != 9 {
			http.Error(w, "Each row must be exactly 9 characters", http.StatusBadRequest)
			return
		}
		for c := 0; c < 9; c++ {
			ch := line[c]
			if ch == '.' {
				board[r][c] = 0
			} else if ch >= '1' && ch <= '9' {
				board[r][c] = int(ch - '0')
			} else {
				http.Error(w, "Invalid character", http.StatusBadRequest)
				return
			}
		}
	}

	if solve(&board) {
		json.NewEncoder(w).Encode(Response{Solved: true, Board: board})
	} else {
		json.NewEncoder(w).Encode(Response{Solved: false, Error: "No solution found"})
	}
}

func checkValidation(board *[9][9]int, row, col, num int) bool {
	for c := 0; c < 9; c++ {
		if board[row][c] == num {
			return false
		}
	}
	for r := 0; r < 9; r++ {
		if board[r][col] == num {
			return false
		}
	}
	startRow := (row / 3) * 3
	startCol := (col / 3) * 3
	for r := 0; r < 3; r++ {
		for c := 0; c < 3; c++ {
			if board[startRow+r][startCol+c] == num {
				return false
			}
		}
	}
	return true
}

func solve(board *[9][9]int) bool {
	for r := 0; r < 9; r++ {
		for c := 0; c < 9; c++ {
			if board[r][c] == 0 {
				for num := 1; num <= 9; num++ {
					if checkValidation(board, r, c, num) {
						board[r][c] = num
						if solve(board) {
							return true
						}
						board[r][c] = 0
					}
				}
				return false
			}
		}
	}
	return true
}

// --------------------------- GENERATOR ----------------------------

func generateHandler(w http.ResponseWriter, r *http.Request) {
	level := r.URL.Query().Get("level")
	if level == "" {
		level = "eazy"
	}

	// number of cells to remove depends on difficulty
	removeCount := 40 // default easy
	switch level {
	case "medium":
		removeCount = 50
	case "difficult":
		removeCount = 60
	}

	board := generateFullBoard()
	puzzle := makePuzzle(board, removeCount)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(PuzzleResponse{Puzzle: puzzle, Level: level})
}

func generateFullBoard() [9][9]int {
	var board [9][9]int
	fillRandom(&board)
	solve(&board)
	return board
}

func fillRandom(board *[9][9]int) {
	for box := 0; box < 9; box += 3 {
		nums := rand.Perm(9)
		for r := 0; r < 3; r++ {
			for c := 0; c < 3; c++ {
				board[box+r][box+c] = nums[r*3+c] + 1
			}
		}
	}
}

func makePuzzle(full [9][9]int, removeCount int) [9][9]int {
	puzzle := full
	cells := rand.Perm(81)
	for i := 0; i < removeCount && i < 81; i++ {
		r := cells[i] / 9
		c := cells[i] % 9
		puzzle[r][c] = 0
	}
	return puzzle
}
