package main

import (
    "crypto/rand"
    "database/sql"
    "encoding/hex"
    "encoding/json"
    "fmt"
    "hash/fnv"
    "math/rand"
    "net/http"
    "os"
    "strconv"
    "strings"
    "sync"
    "time"

    _ "github.com/go-sql-driver/mysql"
    "golang.org/x/crypto/bcrypt"
)

type Request struct { Rows [9]string `json:"rows"` }
type Response struct { Solved bool `json:"solved"`; Board [9][9]int `json:"board"`; Error string `json:"error,omitempty"` }
type PuzzleResponse struct { Puzzle [9][9]int `json:"puzzle"`; Level string `json:"level"`; Unique bool `json:"unique"`; Date string `json:"date,omitempty"` }

type App struct { db *sql.DB; sessions map[string]int64; sessionMu sync.RWMutex }
type authRequest struct { Username string `json:"username"`; Password string `json:"password"` }
type runRequest struct { Score int `json:"score"`; Seconds int `json:"seconds"`; Difficulty string `json:"difficulty"`; Mode string `json:"mode"` }

func main() {
    app := &App{sessions: make(map[string]int64)}
    app.connectDB()
    http.Handle("/", http.FileServer(http.Dir("./static")))
    http.HandleFunc("/solve", solveHandler)
    http.HandleFunc("/generate", generateHandler)
    http.HandleFunc("/daily", dailyHandler)
    http.HandleFunc("/api/register", app.registerHandler)
    http.HandleFunc("/api/login", app.loginHandler)
    http.HandleFunc("/api/logout", app.logoutHandler)
    http.HandleFunc("/api/me", app.meHandler)
    http.HandleFunc("/api/leaderboard", app.leaderboardHandler)
    http.HandleFunc("/api/submit-run", app.submitRunHandler)
    fmt.Println("🚀 Sudoku Quest running at http://localhost:8080")
    if app.db == nil { fmt.Println("ℹ️ Online accounts disabled: configure SUDOKU_DB_DSN to enable MySQL.") }
    if err := http.ListenAndServe(":8080", nil); err != nil { fmt.Println("Server error:", err) }
}

func (a *App) connectDB() {
    dsn := os.Getenv("SUDOKU_DB_DSN")
    if dsn == "" { return }
    db, err := sql.Open("mysql", dsn)
    if err != nil { fmt.Println("DB setup error:", err); return }
    db.SetMaxOpenConns(10); db.SetMaxIdleConns(5); db.SetConnMaxLifetime(30*time.Minute)
    if err := db.Ping(); err != nil { fmt.Println("DB connection error:", err); _ = db.Close(); return }
    a.db = db
    fmt.Println("✅ MySQL online progression enabled")
}

func jsonResponse(w http.ResponseWriter, status int, value any) { w.Header().Set("Content-Type", "application/json"); w.WriteHeader(status); _ = json.NewEncoder(w).Encode(value) }
func validUsername(s string) bool { if len(s)<3||len(s)>30{return false};for _,r:=range s{if !(r>='a'&&r<='z'||r>='A'&&r<='Z'||r>='0'&&r<='9'||r=='_'){return false}};return true }

func (a *App) registerHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost { http.Error(w,"Method not allowed",405); return }
    if a.db == nil { jsonResponse(w,503,map[string]any{"error":"Online accounts are not configured on this server."}); return }
    var req authRequest; if json.NewDecoder(r.Body).Decode(&req)!=nil||!validUsername(req.Username)||len(req.Password)<8 { jsonResponse(w,400,map[string]any{"error":"Use a 3–30 character username and a password of at least 8 characters."}); return }
    hash,err:=bcrypt.GenerateFromPassword([]byte(req.Password),bcrypt.DefaultCost);if err!=nil{jsonResponse(w,500,map[string]any{"error":"Could not create account."});return}
    res,err:=a.db.Exec("INSERT INTO users(username,password_hash,level) VALUES(?,?,1)",req.Username,string(hash));if err!=nil{jsonResponse(w,409,map[string]any{"error":"Username is already taken."});return}
    id,_:=res.LastInsertId(); a.createSession(w,id); jsonResponse(w,201,map[string]any{"ok":true,"username":req.Username})
}

func (a *App) loginHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost { http.Error(w,"Method not allowed",405); return }
    if a.db == nil { jsonResponse(w,503,map[string]any{"error":"Online accounts are not configured on this server."}); return }
    var req authRequest; if json.NewDecoder(r.Body).Decode(&req)!=nil { jsonResponse(w,400,map[string]any{"error":"Invalid request."});return }
    var id int64;var hash string;err:=a.db.QueryRow("SELECT id,password_hash FROM users WHERE username=?",req.Username).Scan(&id,&hash);if err!=nil||bcrypt.CompareHashAndPassword([]byte(hash),[]byte(req.Password))!=nil{jsonResponse(w,401,map[string]any{"error":"Invalid username or password."});return}
    a.createSession(w,id);jsonResponse(w,200,map[string]any{"ok":true,"username":req.Username})
}

func (a *App) createSession(w http.ResponseWriter,id int64){b:=make([]byte,32);if _,err:=rand.Read(b);err!=nil{return};token:=hex.EncodeToString(b);a.sessionMu.Lock();a.sessions[token]=id;a.sessionMu.Unlock();http.SetCookie(w,&http.Cookie{Name:"sudoku_session",Value:token,Path:"/",HttpOnly:true,SameSite:http.SameSiteLaxMode,MaxAge:86400*30})}
func (a *App) userID(r *http.Request)(int64,bool){c,err:=r.Cookie("sudoku_session");if err!=nil{return 0,false};a.sessionMu.RLock();id,ok:=a.sessions[c.Value];a.sessionMu.RUnlock();return id,ok}
func (a *App) logoutHandler(w http.ResponseWriter,r *http.Request){if c,err:=r.Cookie("sudoku_session");err==nil{a.sessionMu.Lock();delete(a.sessions,c.Value);a.sessionMu.Unlock()};http.SetCookie(w,&http.Cookie{Name:"sudoku_session",Value:"",Path:"/",MaxAge:-1,HttpOnly:true});jsonResponse(w,200,map[string]any{"ok":true})}
func (a *App) meHandler(w http.ResponseWriter,r *http.Request){id,ok:=a.userID(r);if !ok||a.db==nil{jsonResponse(w,200,map[string]any{"authenticated":false});return};var username string;var xp,level,streak int;err:=a.db.QueryRow("SELECT username,xp,level,streak FROM users WHERE id=?",id).Scan(&username,&xp,&level,&streak);if err!=nil{jsonResponse(w,200,map[string]any{"authenticated":false});return};jsonResponse(w,200,map[string]any{"authenticated":true,"username":username,"xp":xp,"level":level,"streak":streak})}

func (a *App) leaderboardHandler(w http.ResponseWriter,r *http.Request){if a.db==nil{jsonResponse(w,503,map[string]any{"error":"Global leaderboard is not configured. Local leaderboard still works."});return};rows,err:=a.db.Query("SELECT username,score,seconds,difficulty,mode,created_at FROM leaderboard_runs ORDER BY score DESC,seconds ASC,created_at ASC LIMIT 50");if err!=nil{jsonResponse(w,500,map[string]any{"error":"Could not load leaderboard."});return};defer rows.Close();out:=make([]map[string]any,0);for rows.Next(){var u,d,m string;var score,seconds int;var created time.Time;if rows.Scan(&u,&score,&seconds,&d,&m,&created)==nil{out=append(out,map[string]any{"username":u,"score":score,"seconds":seconds,"difficulty":d,"mode":m,"date":created.Format("2006-01-02")})}};jsonResponse(w,200,out)}

func (a *App) submitRunHandler(w http.ResponseWriter,r *http.Request){if r.Method!=http.MethodPost{http.Error(w,"Method not allowed",405);return};if a.db==nil{jsonResponse(w,503,map[string]any{"error":"Global leaderboard is not configured."});return};id,ok:=a.userID(r);if !ok{jsonResponse(w,401,map[string]any{"error":"Log in to submit a run."});return};var req runRequest;if json.NewDecoder(r.Body).Decode(&req)!=nil||req.Score<0||req.Seconds<0||req.Seconds>3600||len(req.Difficulty)>20||len(req.Mode)>20{jsonResponse(w,400,map[string]any{"error":"Invalid run data."});return};var username string;if err:=a.db.QueryRow("SELECT username FROM users WHERE id=?",id).Scan(&username);err!=nil{jsonResponse(w,401,map[string]any{"error":"Account not found."});return};_,err:=a.db.Exec("INSERT INTO leaderboard_runs(user_id,username,score,seconds,difficulty,mode) VALUES(?,?,?,?,?,?)",id,username,req.Score,req.Seconds,req.Difficulty,req.Mode);if err!=nil{jsonResponse(w,500,map[string]any{"error":"Could not submit run."});return};jsonResponse(w,201,map[string]any{"ok":true})}

func solveHandler(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json"); if r.Method != http.MethodPost { http.Error(w, "Method not allowed", http.StatusMethodNotAllowed); return }
    var req Request; if err := json.NewDecoder(r.Body).Decode(&req); err != nil { http.Error(w, "Invalid JSON", http.StatusBadRequest); return }
    var board [9][9]int; for row:=0;row<9;row++{line:=req.Rows[row];if len(line)!=9{http.Error(w,"Each row must be exactly 9 characters",400);return};for col:=0;col<9;col++{ch:=line[col];switch{case ch=='.':board[row][col]=0;case ch>='1'&&ch<='9':board[row][col]=int(ch-'0');default:http.Error(w,"Invalid character",400);return}}}
    if !isValidBoard(&board){json.NewEncoder(w).Encode(Response{Solved:false,Error:"Invalid Sudoku: duplicate numbers found."});return};if solve(&board){json.NewEncoder(w).Encode(Response{Solved:true,Board:board})}else{json.NewEncoder(w).Encode(Response{Solved:false,Error:"No solution found"})}
}
func isValidBoard(board *[9][9]int) bool {for r:=0;r<9;r++{for c:=0;c<9;c++{n:=board[r][c];if n==0{continue};board[r][c]=0;if !checkValidation(board,r,c,n){board[r][c]=n;return false};board[r][c]=n}};return true}
func checkValidation(board *[9][9]int,row,col,num int) bool {for c:=0;c<9;c++{if board[row][c]==num{return false}};for r:=0;r<9;r++{if board[r][col]==num{return false}};sr,sc:=(row/3)*3,(col/3)*3;for r:=0;r<3;r++{for c:=0;c<3;c++{if board[sr+r][sc+c]==num{return false}}};return true}
func solve(board *[9][9]int) bool {for r:=0;r<9;r++{for c:=0;c<9;c++{if board[r][c]==0{for n:=1;n<=9;n++{if checkValidation(board,r,c,n){board[r][c]=n;if solve(board){return true};board[r][c]=0}};return false}}};return true}
func countSolutions(board *[9][9]int,limit int) int {count:=0;var search func();search=func(){if count>=limit{return};bestR,bestC,bestN:=-1,-1,10;for r:=0;r<9;r++{for c:=0;c<9;c++{if board[r][c]!=0{continue};n:=0;for v:=1;v<=9;v++{if checkValidation(board,r,c,v){n++}};if n<bestN{bestN=n;bestR=r;bestC=c;if n==1{break}}};if bestN==1{break}};if bestR==-1{count++;return};if bestN==0{return};for v:=1;v<=9;v++{if checkValidation(board,bestR,bestC,v){board[bestR][bestC]=v;search();board[bestR][bestC]=0;if count>=limit{return}}}};search();return count}
func difficultyRemovals(level string)(string,int){switch level{case "medium":return "medium",50;case "difficult","hard":return "difficult",58;default:return "easy",40}}
func generateHandler(w http.ResponseWriter,r *http.Request){w.Header().Set("Content-Type","application/json");level,removeCount:=difficultyRemovals(r.URL.Query().Get("level"));rng:=rand.New(rand.NewSource(time.Now().UnixNano()));full:=generateFullBoard(rng);puzzle:=makeUniquePuzzle(full,removeCount,rng);json.NewEncoder(w).Encode(PuzzleResponse{Puzzle:puzzle,Level:level,Unique:true})}
func dailyHandler(w http.ResponseWriter,r *http.Request){w.Header().Set("Content-Type","application/json");level,removeCount:=difficultyRemovals(r.URL.Query().Get("level"));date:=r.URL.Query().Get("date");if _,err:=time.Parse("2006-01-02",date);err!=nil{date=time.Now().UTC().Format("2006-01-02")};h:=fnv.New64a();_,_=h.Write([]byte("sudoku-quest-daily:"+date+":"+level));rng:=rand.New(rand.NewSource(int64(h.Sum64())));full:=generateFullBoard(rng);puzzle:=makeUniquePuzzle(full,removeCount,rng);json.NewEncoder(w).Encode(PuzzleResponse{Puzzle:puzzle,Level:level,Unique:true,Date:date})}
func generateFullBoard(rng *rand.Rand)[9][9]int{var board [9][9]int;fillRandom(&board,rng);solve(&board);return board}
func fillRandom(board *[9][9]int,rng *rand.Rand){for box:=0;box<9;box+=3{nums:=rng.Perm(9);for r:=0;r<3;r++{for c:=0;c<3;c++{board[box+r][box+c]=nums[r*3+c]+1}}}}
func makeUniquePuzzle(full [9][9]int,removeCount int,rng *rand.Rand)[9][9]int{p:=full;cells:=rng.Perm(81);removed:=0;for _,idx:=range cells{if removed>=removeCount{break};r,c:=idx/9,idx%9;backup:=p[r][c];p[r][c]=0;test:=p;if countSolutions(&test,2)==1{removed++}else{p[r][c]=backup}};return p}

// Keep imports used by the generated server explicit for Go tooling.
var _ = strconv.Itoa
var _ = strings.TrimSpace
