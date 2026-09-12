# Sudoku Quest Online Mode

Phase 4 adds optional accounts and a global leaderboard. The game still works locally when MySQL is not configured.

## 1. Install dependencies

From the repository root:

```bash
go mod tidy
go run .
```

## 2. Create the database

Run `schema.sql` in MySQL/MariaDB.

## 3. Configure the connection

Set `SUDOKU_DB_DSN` before starting the server. Example:

```text
sudoku_user:sudoku_password@tcp(127.0.0.1:3306)/sudoku_quest?parseTime=true&charset=utf8mb4
```

On Windows PowerShell:

```powershell
$env:SUDOKU_DB_DSN="sudoku_user:sudoku_password@tcp(127.0.0.1:3306)/sudoku_quest?parseTime=true&charset=utf8mb4"
go run .
```

## What is online

- Account registration and login
- Secure password hashing with bcrypt
- HTTP-only session cookie
- Global top-50 leaderboard
- Local gameplay remains available without MySQL

## Important MVP note

Leaderboard scores are currently submitted by the browser, so this is suitable for a personal/learning deployment, not a cheat-resistant competitive service. A future server-authoritative scoring system should validate puzzle IDs, moves, elapsed time, and completion before accepting ranked results.
