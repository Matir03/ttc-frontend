import { Color, Move } from "./ttc/types";

export type SeekColor = "White" | "Black" | "Random";
export const colors: Array<SeekColor> = ["White", "Black", "Random"];

export interface Seek {
    id: number;
    player: string;
    color: SeekColor;
}

export interface ChatMessage {
    sender: string;
    text: string;
}

export type Chat = ChatMessage[];

export interface LobbyState {
    seeks: Seek[];
    chat: Chat;
}

export class MappedLobbyState {
    seeks: Map<number, Seek>;
    chat: Chat;

    constructor(state: LobbyState) {
        this.seeks = new Map(state.seeks.map(
            seek => [seek.id, seek]
        ));
    }

    insert(seek: Seek) {
        this.seeks.set(seek.id, seek);
    }

    remove(id: number) {
        this.seeks.delete(id);
    }

    toLobbyState(): LobbyState {
        return {
            seeks: Array.from(this.seeks,
                ([id, seek]) => seek),
            chat: this.chat
        }
    }
}

export interface Action {
    kind: string;
}

export class MakeSeek implements Action {
    kind = "MakeSeek";
    color: SeekColor;

    constructor(color: SeekColor) {
        this.color = color;
    }
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

export interface ReceivedGameState {
    white: string;
    black: string;

    game: Move[];
    chat: Chat;

    drawOffer: string;
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

    constructor(move: Move, color: Color) {
        this.move = move;
        this.color = color;
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