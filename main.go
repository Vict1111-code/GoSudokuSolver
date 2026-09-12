package main

import (
    "encoding/json"
    "fmt"
    "hash/fnv"
    "math/rand"
    "net/http"
    "strconv"
    "time"
)

type Request struct { Rows [9]string `json:"rows"` }
type Response struct { Solved bool `json:"solved"`; Board [9][9]int `json:"board"`; Error string `json:"error,omitempty"` }
type PuzzleResponse struct { Puzzle [9][9]int `json:"puzzle"`; Level string `json:"level"`; Unique bool `json:"unique"`; Date string `json:"date,omitempty"` }

func main() {
    http.Handle("/", http.FileServer(http.Dir("./static")))
    http.HandleFunc("/solve", solveHandler)
    http.HandleFunc("/generate", generateHandler)
    http.HandleFunc("/daily", dailyHandler)
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

func countSolutions(board *[9][9]int, limit int) int {
    count:=0
    var search func()
    search=func(){ if count>=limit{return}; bestR,bestC,bestN:=-1,-1,10
        for r:=0;r<9;r++ {for c:=0;c<9;c++ {if board[r][c]!=0{continue};n:=0;for v:=1;v<=9;v++{if checkValidation(board,r,c,v){n++}};if n<bestN{bestN=n;bestR=r;bestC=c;if n==1{break}}};if bestN==1{break}}
        if bestR==-1{count++;return}; if bestN==0{return}
        for v:=1;v<=9;v++ {if checkValidation(board,bestR,bestC,v){board[bestR][bestC]=v;search();board[bestR][bestC]=0;if count>=limit{return}}}
    }
    search(); return count
}

func difficultyRemovals(level string) (string,int) { switch level {case "medium":return "medium",50;case "difficult","hard":return "difficult",58;default:return "easy",40} }
func generateHandler(w http.ResponseWriter,r *http.Request) {
    w.Header().Set("Content-Type","application/json")
    level,removeCount:=difficultyRemovals(r.URL.Query().Get("level"))
    full:=generateFullBoard(rand.New(rand.NewSource(time.Now().UnixNano())))
    puzzle:=makeUniquePuzzle(full,removeCount,rand.New(rand.NewSource(time.Now().UnixNano()+17)))
    json.NewEncoder(w).Encode(PuzzleResponse{Puzzle:puzzle,Level:level,Unique:true})
}
func dailyHandler(w http.ResponseWriter,r *http.Request) {
    w.Header().Set("Content-Type","application/json")
    level,removeCount:=difficultyRemovals(r.URL.Query().Get("level")); if level==""{level="medium";removeCount=50}
    date:=r.URL.Query().Get("date"); if _,err:=time.Parse("2006-01-02",date);err!=nil {date=time.Now().UTC().Format("2006-01-02")}
    h:=fnv.New64a();_,_=h.Write([]byte("sudoku-quest-daily:"+date+":"+level));seed:=int64(h.Sum64())
    rng:=rand.New(rand.NewSource(seed));full:=generateFullBoard(rng);puzzle:=makeUniquePuzzle(full,removeCount,rng)
    json.NewEncoder(w).Encode(PuzzleResponse{Puzzle:puzzle,Level:level,Unique:true,Date:date})
}
func generateFullBoard(rng *rand.Rand) [9][9]int {var board [9][9]int;fillRandom(&board,rng);solve(&board);return board}
func fillRandom(board *[9][9]int,rng *rand.Rand) {for box:=0;box<9;box+=3 {nums:=rng.Perm(9);for r:=0;r<3;r++ {for c:=0;c<3;c++ {board[box+r][box+c]=nums[r*3+c]+1}}}}
func makeUniquePuzzle(full [9][9]int,removeCount int,rng *rand.Rand) [9][9]int {
    p:=full;cells:=rng.Perm(81);removed:=0
    for _,idx:=range cells {if removed>=removeCount{break};r,c:=idx/9,idx%9;backup:=p[r][c];p[r][c]=0;test:=p;if countSolutions(&test,2)==1{removed++}else{p[r][c]=backup}}
    return p
}

var _ = strconv.Itoa
