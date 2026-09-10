package main

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"time"
)

type Request struct { Rows [9]string `json:"rows"` }
type Response struct { Solved bool `json:"solved"`; Board [9][9]int `json:"board"`; Error string `json:"error,omitempty"` }
type PuzzleResponse struct { Puzzle [9][9]int `json:"puzzle"`; Level string `json:"level"` }

func main() {
	rand.Seed(time.Now().UnixNano())
	http.Handle("/", http.FileServer(http.Dir("./static")))
	http.HandleFunc("/solve", solveHandler)
	http.HandleFunc("/generate", generateHandler)
	fmt.Println("🚀 Sudoku Quest running at http://localhost:8080")
	if err := http.ListenAndServe(":8080", nil); err != nil { fmt.Println("Server error:", err) }
}

func solveHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost { http.Error(w, "Method not allowed", http.StatusMethodNotAllowed); return }
	var req Request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil { http.Error(w, "Invalid JSON", http.StatusBadRequest); return }
	var board [9][9]int
	for row := 0; row < 9; row++ {
		line := req.Rows[row]
		if len(line) != 9 { http.Error(w, "Each row must be exactly 9 characters", http.StatusBadRequest); return }
		for col := 0; col < 9; col++ {
			ch := line[col]
			switch { case ch == '.': board[row][col] = 0; case ch >= '1' && ch <= '9': board[row][col] = int(ch-'0'); default: http.Error(w, "Invalid character", http.StatusBadRequest); return }
		}
	}
	if !isValidBoard(&board) { json.NewEncoder(w).Encode(Response{Solved:false, Error:"Invalid Sudoku: duplicate numbers found."}); return }
	if solve(&board) { json.NewEncoder(w).Encode(Response{Solved:true, Board:board}) } else { json.NewEncoder(w).Encode(Response{Solved:false, Error:"No solution found"}) }
}

func isValidBoard(board *[9][9]int) bool {
	for r:=0;r<9;r++ { for c:=0;c<9;c++ { n:=board[r][c]; if n==0 {continue}; board[r][c]=0; if !checkValidation(board,r,c,n) { board[r][c]=n; return false }; board[r][c]=n } }
	return true
}
func checkValidation(board *[9][9]int,row,col,num int) bool { for c:=0;c<9;c++ {if board[row][c]==num{return false}}; for r:=0;r<9;r++ {if board[r][col]==num{return false}}; sr,sc:=(row/3)*3,(col/3)*3; for r:=0;r<3;r++ {for c:=0;c<3;c++ {if board[sr+r][sc+c]==num{return false}}}; return true }
func solve(board *[9][9]int) bool { for r:=0;r<9;r++ {for c:=0;c<9;c++ {if board[r][c]==0 {for n:=1;n<=9;n++ {if checkValidation(board,r,c,n) {board[r][c]=n;if solve(board){return true};board[r][c]=0}};return false}}};return true }

func generateHandler(w http.ResponseWriter,r *http.Request) {
	w.Header().Set("Content-Type","application/json")
	level:=r.URL.Query().Get("level"); if level=="" {level="easy"}
	removeCount:=40
	switch level {case "medium":removeCount=50;case "difficult", "hard":level="difficult";removeCount=58;case "easy":default:level="easy"}
	full:=generateFullBoard(); puzzle:=makePuzzle(full,removeCount)
	json.NewEncoder(w).Encode(PuzzleResponse{Puzzle:puzzle,Level:level})
}
func generateFullBoard() [9][9]int {var board [9][9]int;fillRandom(&board);solve(&board);return board}
func fillRandom(board *[9][9]int) {for box:=0;box<9;box+=3 {nums:=rand.Perm(9);for r:=0;r<3;r++ {for c:=0;c<3;c++ {board[box+r][box+c]=nums[r*3+c]+1}}}}
func makePuzzle(full [9][9]int,removeCount int) [9][9]int {p:=full;cells:=rand.Perm(81);for i:=0;i<removeCount&&i<81;i++ {r,c:=cells[i]/9,cells[i]%9;p[r][c]=0};return p}
