export const SOCKET_ADDR = process.env.NODE_ENV === "production" ? 
    "https://time-travel-chess-server.herokuapp.com" : "ws://localhost:3000";