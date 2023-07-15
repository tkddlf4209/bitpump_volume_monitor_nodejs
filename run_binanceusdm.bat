@echo off

REM node_modules Folder CHeck
if not exist node_modules (
  echo "node_modules folder not exist. npm install run..."
  npm install
)

REM index.js 실행
echo "index.js running..."
node index.js binanceusdm