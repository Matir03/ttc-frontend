import { colors, Seek, Action, LobbyState, 
    RemoveSeek, ChatAction, UpdatePlayer,
    SeekColor, MakeSeek, MappedLobbyState, AddSeek, ChatEvent,
    DeleteSeek, AcceptSeek, UpdateGame, WatchGame } from './commontypes';
import { h, VNode } from 'snabbdom';

function scroll(elm: HTMLElement) {
    elm.scrollTop = elm.scrollHeight;
}

export class Lobby {

    pname: string;
    state: MappedLobbyState;
    curSeekColor: SeekColor;
    incomingSeeks: Map<number, Seek>;
    outgoingSeeks: Map<number, Seek>;
    chatUpdated: boolean;

    emit: (action: Action) => void;

    constructor(pname: string, 
        emit: (action: Action) => void) {

        this.pname = pname;
        this.emit = emit;
        this.curSeekColor = "Random";
        this.incomingSeeks = new Map();
        this.outgoingSeeks = new Map();
        this.chatUpdated = false;
    }

    setState(state: LobbyState) {
        this.state = new MappedLobbyState(state);    
        this.incomingSeeks.clear();
        this.outgoingSeeks.clear();
        this.chatUpdated = true;

        for(const seek of state.seeks) {
            if(seek.player === this.pname) {
                this.outgoingSeeks.set(seek.id, seek);
            } else {
                this.incomingSeeks.set(seek.id, seek);
            }
        }
    }

    update(event: Action) {
        console.log(`Receiving lobby event ${JSON.stringify(event)}`);
        
        switch(event.kind) {

            case "AddSeek":
                const seek = (event as AddSeek).seek;
                this.state.insertSeek(seek);

                if(seek.player === this.pname) {
                    this.outgoingSeeks.set(seek.id, seek);
                } else {
                    this.incomingSeeks.set(seek.id, seek);
                }

                break;

            case "RemoveSeek":
                const seekId = (event as RemoveSeek).id;
                this.state.removeSeek(seekId);

                if(this.outgoingSeeks.has(seekId)) {
                    this.outgoingSeeks.delete(seekId);
                }

                if(this.incomingSeeks.has(seekId)) {
                    this.incomingSeeks.delete(seekId);
                }

                break;
            
            case "UpdateGame":
                const game = (event as UpdateGame).game;
                this.state.updateGame(game);
                break;

            case "UpdatePlayer":
                const player = (event as UpdatePlayer).player;
                this.state.updatePlayer(player);
                break;

            case "ChatEvent":
                const msg = (event as ChatEvent).message;

                this.state.updateChat(msg);
                this.chatUpdated = true;
                break;
        }

        console.log(`New lobby state: 
            ${JSON.stringify(this.state.toLobbyState())}`);
    }

    view(): VNode {
        return h('div#root.lobby', [
            this.incoming(),
            this.games(),
            this.outgoing(),
            this.seekmaker(),
            this.players(),
            this.chat()
        ]);
    }

    incoming(): VNode {
        return h('div#incoming.toplevel', [h('div.scroll', [h('table', 
            [h('tr', [
                h('th', "Player"),
                h('th', "Color"),
                h('th', "Accept"),
            ])].concat(Array.from(this.incomingSeeks, 
                ([id, seek]) => h('tr', [
                    h('td', seek.player),
                    h('td', seek.color),
                    h('td', this.pname === seek.player ? 
                        [h('button', 
                            {on: {click: () => {
                                this.emit(new DeleteSeek(id));
                            }}},
                            "Delete")]
                        :
                        [h('button', 
                            {on: {click: () => {
                                this.emit(new AcceptSeek(id));
                            }}},
                            "Accept")] 
                    )
                ])
            ))
        )])]);
    }

    games(): VNode {
        return h('div#games.toplevel', [h('div.scroll', [h('table',
            [h('tr', [
                h('th', "White"),
                h('th', "Black"),
                h('th', "Status"),
                h('th', "Spectate"),
            ])].concat(Array.from(this.state.games,
                ([id, game]) => h('tr', [
                    h('td', game.white),
                    h('td', game.black),
                    h('td', game.status),
                    h('td', h('button', 
                        {on: {click: () => 
                            this.emit(new WatchGame(id))}}, 
                        "Spectate"))
                ])
            ))
        )])]);
    }

    outgoing(): VNode {
        return h('div#outgoing.toplevel', [h('div.scroll', [h('table',
            [h('tr', [
                h('th', "Color"),
                h('th', "Cancel"),
            ])].concat(Array.from(this.outgoingSeeks,
                ([id, seek]) => h('tr', [
                    h('td', seek.color),
                    h('td', h('button',
                        {on: {click: () =>
                            this.emit(new DeleteSeek(id))}},
                        "Cancel"))
                ])
            ))
        )])]);
    }

    players(): VNode {
        return h('div#players.toplevel', [h('div.scroll', [h('table',
            [h('tr', [
                h('th', "Player"),
                h('th', "Status"),
                h('th', "Challenge"),
            ])].concat(Array.from(this.state.players,
                ([name, player]) => h('tr', [
                    h('td', player.name),
                    h('td', player.status),
                    h('td', h('button',
                        {on: {click: () =>
                            this.emit(new MakeSeek(this.curSeekColor))}},
                    'Challenge'))
                ])
            ))
        )])]);
    }

    seekmaker(): VNode {
        const makeRadioButton = (color: SeekColor) => h('span', [
            h('input', {props: {
                type: 'radio', id: color, 
                name: 'color', value: color,
                checked: color === this.curSeekColor
            }, on: {click: () => this.curSeekColor = color}}),
            h('label', {props: {for: color}}, color),
        ]);
    
        return h('div#seekmaker.toplevel', [
            h('div', colors.map(makeRadioButton)),
            h('button', {
                on: {click: () => 
                    this.emit(new MakeSeek(this.curSeekColor))}
            }, "Create Seek")
        ]);
    }

    chat(): VNode {
        return h('div#chat.toplevel', {on: {change: () => 
            scroll(document.getElementById("chat-box"))
        }}, [
            h('div#chat-box', this.state.chat.map(msg => 
                msg.sender ? 
                    h('div.message', [
                        h('span.sender', `${msg.sender}: `),
                        h('span.text', msg.text),
                    ]) :
                    h('div.message', [h('span.notice', msg.text)])
            )),
            h('input', {
                on: {
                    keyup: (e: KeyboardEvent) => {
                        const target = e.target as HTMLInputElement;

                        if(e.key === "Enter" && target.value) {
                            this.emit(new ChatAction(target.value));
                            target.value = '';
                        }
                    }
                }
            }),
        ]);
    }
}