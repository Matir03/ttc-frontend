import { Color, Move } from "./ttc/types";

export type SeekColor = "White" | "Black" | "Random";
export const colors: Array<SeekColor> = ["White", "Black", "Random"];

export interface Seek {
    id: number;
    player: string;
    opponent: string;
    color: SeekColor;
    timeWhite: TimeControl;
    timeBlack: TimeControl;
}

export interface ChatMessage {
    sender: string;
    text: string;
}

export type Chat = ChatMessage[];

export interface LobbyGame {
    id: number;
    white: string;
    black: string;
    status: string;
}

export interface LobbyPlayer {
    name: string;
    status: string;
}

export interface LobbyState {
    seeks: Seek[];
    games: LobbyGame[];
    chat: Chat;
    players: LobbyPlayer[]; 
}

export class MappedLobbyState {
    seeks: Map<number, Seek>;
    games: Map<number, LobbyGame>;
    players: Map<string, LobbyPlayer>;
    chat: Chat;

    constructor(state: LobbyState) {
        this.seeks = new Map(state.seeks.map(
            seek => [seek.id, seek]
        ));

        this.games = new Map(state.games.map(
            game => [game.id, game]
        ));

        this.players = new Map(state.players.map(
            player => [player.name, player]
        ));

        this.chat = state.chat;
    }

    insertSeek(seek: Seek) {
        this.seeks.set(seek.id, seek);
    }

    removeSeek(id: number) {
        this.seeks.delete(id);
    }

    updateGame(game: LobbyGame) {
        this.games.set(game.id, game);
    }

    updatePlayer(player: LobbyPlayer) {
        this.players.set(player.name, player);
    }

    updateChat(msg: ChatMessage) {
        this.chat.push(msg);
    }

    toLobbyState(pname = ""): LobbyState {
        return {
            seeks: Array.from(this.seeks,
                ([id, seek]) => seek)
                .filter(seek => 
                    pname === "" ||
                    seek.player === pname || 
                    seek.opponent === pname ||
                    seek.opponent === ""), 
            games: Array.from(this.games,
                ([id, game]) => game),
            players: Array.from(this.players,
                ([name, player]) => player),
            chat: this.chat
        }
    }
}

export interface Action {
    kind: string;
}

export class MakeSeek implements Action {
    kind = "MakeSeek";

    constructor(
        public color: SeekColor,
        public timeWhite: TimeControl,
        public timeBlack: TimeControl,
        public opponent: string
    ) {}
}

export class DeleteSeek implements Action {
    kind = "DeleteSeek";
    id: number;

    constructor(id: number) {
        this.id = id;
    }
}

export class AcceptSeek implements Action {
    kind = "AcceptSeek";
    id: number;
    
    constructor(id: number) {
        this.id = id;
    }
}

export class AddSeek implements Action {
    kind = "AddSeek";
    seek: Seek; 

    constructor(seek: Seek) {
        this.seek = seek;
    }
}

export class RemoveSeek implements Action {
    kind = "RemoveSeek";
    id: number;

    constructor(id: number) {
        this.id = id;
    }
}

export class UpdateGame implements Action {
    kind = "UpdateGame";
    game: LobbyGame;

    constructor(game: LobbyGame) {
        this.game = game;
    }
}

export class UpdatePlayer implements Action {
    kind = "UpdatePlayer";
    player: LobbyPlayer;

    constructor(player: LobbyPlayer) {
        this.player = player;
    }
}

export class WatchGame implements Action {
    kind = "WatchGame";
    id: number;

    constructor(id: number) {
        this.id = id;
    }
}

export class WatchPlayer implements Action {
    kind = "WatchPlayer";
    name: string;

    constructor(name: string) {
        this.name = name;
    }
}

export interface TimeControl {
    base: number;
    incr: number;
}

export interface ClockInfo {
    white: TimeControl;
    black: TimeControl;

    timeleft: number[];
    timestamp: number;
}

export interface ReceivedGameState {
    white: string;
    black: string;

    game: Move[];

    clockInfo: ClockInfo;
    
    chat: Chat;

    drawOffer: string;
    
    ended: boolean;
}

export class MakeMove implements Action {
    kind = "MakeMove";
    move: Move;

    constructor(move: Move) {
        this.move = move;
    }
}

export class PerformMove implements Action {
    kind = "PerformMove";
    move: Move;
    color: Color;
    timestamp: number;

    constructor(move: Move, color: Color, timestamp: number) {
        this.move = move;
        this.color = color;
        this.timestamp = timestamp;
    }
}

export class ChatAction implements Action {
    kind = "ChatAction";

    constructor(public message: string) {}
}

export class ChatEvent implements Action {
    kind = "ChatEvent";

    constructor(public message: ChatMessage) {}
}

export interface TaggedAction extends Action {
    kind: string;
    player: string;
}

export interface ServerToClientEvents {
    join_lobby:  (state: LobbyState) => void;
    join_game:   (state: ReceivedGameState)  => void;
    lobby_event: (event: Action) => void;
    game_event:  (event: Action)  => void;
}

export interface ClientToServerEvents {
    player_join:  (pname:  string)      => void;
    lobby_action: (action: Action) => void;
    game_action:  (action: Action)  => void;
}



