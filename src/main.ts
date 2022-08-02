import { SOCKET_ADDR } from './config';
import { Socket, io } from 'socket.io-client';
import { Lobby } from './lobby';
import { GameClient } from './gameclient';
import { attributesModule, classModule, eventListenersModule, h, init, 
    propsModule, styleModule, toVNode, VNode } from 'snabbdom';
import { ClientToServerEvents, ServerToClientEvents } from './commontypes';
import { Board } from './ttc/board';

const isDevelopment = process.env.NODE_ENV === 'development';

console.log("The source code for this project is available at https://github.com/Matir03/time-travel-chess");

const patch = init([
    attributesModule,
    classModule,
    propsModule,
    styleModule,
    eventListenersModule
]);

let lobby: Lobby,
    game: GameClient;

let root = toVNode(document.getElementById("root"));
const setView = (node: VNode) => root = patch(root, node);

let pname = prompt("Enter a player name"); 

setView(h('div#root', [
    h('h1', `Connecting to server at ${SOCKET_ADDR}`)
]));

const socket: Socket<ServerToClientEvents, ClientToServerEvents>
    = io(SOCKET_ADDR);

socket.on("connect", () => {
    console.log("Connected!");

    if(!pname) pname = "anon" + socket.id;

    game = new GameClient(pname, action => {
        console.log(`Emitting game action ${JSON.stringify(action)}`)
        socket.emit("game_action", action);
    });

    lobby = new Lobby(pname, action => {
        console.log(`Emitting lobby action ${JSON.stringify(action)}`);
        socket.emit("lobby_action", action);
    });

    if(isDevelopment) {
        window['game'] = game;
        window['lobby'] = lobby;
    }

    socket.emit("player_join", pname);
});

socket.on("connect_error", (err) => {
    console.log(`Connection error: ${err.message}`);
})

socket.on("disconnect", (reason) => {
    console.log(`Disconnected from server because: ${reason}`);

    if(reason === "io server disconnect") {
        setView(h('h1', 'Name already taken'));

        pname = prompt("Enter a different player name");
        if(!pname) pname = "anon" + socket.id;

        socket.connect();
    }
});

socket.on("join_lobby", (state) => {
    console.log(`Joining lobby with state
        ${JSON.stringify(state)}`);
    lobby.setState(state);
    setView(lobby.view());
});

socket.on("lobby_event", (event) => {
    lobby.update(event);
    setView(lobby.view());
});

socket.on("join_game", (state) => {
    console.log(`Joining game with state
        ${JSON.stringify(state)}`);
    game.setState(state);
    setView(h('div#root'));
    setView(game.view());
});

socket.on("game_event", (event) => {
    game.update(event);
});