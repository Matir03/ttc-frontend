import { colors, Seek, Action, LobbyState, WatchPlayer,
    RemoveSeek, ChatAction, UpdatePlayer,
    SeekColor, MakeSeek, MappedLobbyState, AddSeek, ChatEvent,
    DeleteSeek, AcceptSeek, UpdateGame, WatchGame, TimeControl } from './commontypes';
import { attributesModule, classModule, eventListenersModule, h, 
    init, propsModule, styleModule, VNode } from 'snabbdom';
import { Color } from './ttc/types';
import { opposite } from './ttc/board';

const patch = init([
    attributesModule,
    classModule,
    propsModule,
    styleModule,
    eventListenersModule
]);    

function scroll(elm: HTMLElement) {
    elm.scrollTop = elm.scrollHeight;
}

function formatGame(white: TimeControl, black: TimeControl) {
    const formatTime = (time: number) => {
        const hrs = Math.floor(time / 3600000);
        const mins = Math.floor((time % 3600000) / 60000);
        const secs = Math.floor((time % 60000) / 1000);

        const minStr = mins.toString().padStart(2, '0');
        const secStr = secs.toString().padStart(2, '0');

        if(hrs > 0) {
            if(secs > 0) return `${hrs}:${minStr}:${secStr}`;
            if(mins > 0) return `${hrs}:${minStr} hrs`;
            return `${hrs} hr${hrs > 1 ? 's' : ''}`;
        }

        if(mins > 0) {
            if(secs > 0) return `${mins}:${secStr} min`;
            return `${mins} min`;
        }

        return `${secs} sec`;
    }

    const formatControl = (time: TimeControl) => {
        if(!time) return '-';

        return `${formatTime(time.base)}${time.incr > 0 ? 
            ` + ${formatTime(time.incr)}` : ''}`;
    }

    const whiteStr = formatControl(white);
    const blackStr = formatControl(black);

    if(whiteStr === blackStr) return whiteStr;

    return `${whiteStr} / ${blackStr}`;
}

export class Lobby {

    pname: string;
    state: MappedLobbyState;
    curSeekColor: SeekColor;
    curTimeSame: boolean;
    curTimeUnlimited: boolean;
    curTime: {
        white: TimeControl,
        black: TimeControl
    }
    incomingSeeks: Map<number, Seek>;
    outgoingSeeks: Map<number, Seek>;
    chatUpdated: boolean;
    seekNode: VNode;

    emit: (action: Action) => void;

    constructor(pname: string, 
        emit: (action: Action) => void) {

        this.pname = pname;
        this.emit = emit;
        this.curSeekColor = "Random";
        this.curTime = {
            white: {base: 180000, incr: 2000},
            black: {base: 180000, incr: 2000}
        }
        this.curTimeSame = true;
        this.curTimeUnlimited = false;
        this.incomingSeeks = new Map();
        this.outgoingSeeks = new Map();
        this.seekNode = this.seekmaker();
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
            this.seekNode = this.seekmaker(),
            this.players(),
            this.chat()
        ]);
    }

    incoming(): VNode {
        return h('div#incoming.toplevel', [h('div.scroll', [h('table', 
            [h('tr', [
                h('th', "Player"),
                h('th', "Type"),
                h('th', "Color"),
                h('th', "Time"),
                h('th', "Accept"),
            ])].concat(Array.from(this.incomingSeeks, 
                ([id, seek]) => h('tr', [
                    h('td', seek.player),
                    h('td', seek.opponent ? "Challenge" : "Seek"),
                    h('td', seek.color),
                    h('td', formatGame(seek.timeWhite, seek.timeBlack)),
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
                h('th', "Opponent"),
                h('th', "Color"),
                h('th', "Time"),
                h('th', "Cancel"),
            ])].concat(Array.from(this.outgoingSeeks,
                ([id, seek]) => h('tr', [
                    h('td', seek.opponent ? seek.opponent : "Any"),
                    h('td', seek.color),
                    h('td', formatGame(seek.timeWhite, seek.timeBlack)),
                    h('td', h('button',
                        {on: {click: () =>
                            this.emit(new DeleteSeek(id))}},
                        "Cancel"))
                ])
            ))
        )])]);
    }

    players(): VNode {
        return h('div#players.toplevel', h('div.scroll', h('table',
            [h('tr', [
                h('th', "Player"),
                h('th', "Status"),
                h('th', "Action"),
            ])].concat(Array.from(this.state.players,
                ([name, player]) => h('tr', [
                    h('td', player.name),
                    h('td', player.status),
                    player.status === "playing" ||
                    player.status === "spectating" ?
                        h('td', h('button',
                            {on: {click: () => this.emit(
                                new WatchPlayer(name))}},
                            "Spectate")) :
                    player.name === this.pname ?
                        h('td', "You") :    
                        h('td', h('button',
                            {on: {click: () => this.emit(
                                this.curTimeUnlimited ? 
                                new MakeSeek(this.curSeekColor, 
                                    undefined, undefined,
                                    name) :
                                new MakeSeek(
                                    this.curSeekColor,
                                    this.curTime.white,
                                    this.curTime.black,
                                    name
                                )
                            )}},
                        'Challenge'))
                ])
            ))
        )));
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

        const makeTimeInput = (color: Color) => h(`div#time-${color}.time`, [
            h('span', `${color === 'white' ?
                "White" : "Black"} time:`),
            h('div.base', {
                on: {change: () => {
                    const minElm = document.getElementById(`${color}-base-min`);
                    const secElm = document.getElementById(`${color}-base-sec`);

                    this.curTime[color].base = parseInt(minElm["value"]) * 60000
                        + parseInt(secElm["value"]) * 1000;

                    if(this.curTimeSame) 
                        this.curTime[opposite(color)].base = 
                        this.curTime[color].base;
                }}
            }, [
                h('span', "Base:"),
                h('input', {props: {
                    type: 'number', id: `${color}-base-min`,
                    value: Math.floor(this.curTime[color].base / 60000),
                    min: 0
                }}),
                h('span', "min"),
                h('input', {props: {
                    type: 'number', id: `${color}-base-sec`,
                    value: Math.floor((this.curTime[color].base % 60000) / 1000),
                    min: 0, max: 59
                }}),
                h('span', "sec")
            ]),
            h('div.incr', {
                on: {change: () => {
                    const elm = document.getElementById(`${color}-incr`);
                    this.curTime[color].incr = parseInt(elm["value"]) * 1000;

                    if(this.curTimeSame)
                        this.curTime[opposite(color)].incr =
                        this.curTime[color].incr;
                }}
            }, [
                h('span', "Increment:"),
                h('input', {props: {
                    type: 'number', id: `${color}-incr`,
                    value: Math.floor(this.curTime[color].incr / 1000),
                    min: 0
                }}),
                h('span', "sec")
            ]),
        ]);
    
        return h('div#seekmaker.toplevel', {on: {change: () => 
                this.seekNode = patch(this.seekNode, this.seekmaker())
        }}, [
            h('div.times', ["white", "black"].map(makeTimeInput)),
            h('div', [
                h('span', "Time Controls:"),
                h('input', {props: {
                    type: 'radio', id: 'same',
                    name: 'mode', value: 'same',
                    checked: this.curTimeSame,
                }, on: {click: () => {
                    this.curTimeSame = true;
                    this.curTime.black.base = this.curTime.white.base;
                    this.curTime.black.incr = this.curTime.white.incr;
                    this.curTimeUnlimited = false;
                }}}),
                h('label', {props: {for: 'same'}}, "Same"),
                h('input', {props: {
                    type: 'radio', id: 'diff',
                    name: 'mode', value: 'diff',
                    checked: !this.curTimeSame,
                }, on: {click: () => {
                    this.curTimeSame = false;
                    this.curTimeUnlimited = false;
                }}}),
                h('label', {props: {for: 'diff'}}, "Different"),
                h('input', {props: {
                    type: 'radio', id: 'unlimited',
                    name: 'mode', value: 'unlimited',
                    checked: this.curTimeUnlimited,
                }, on: {click: () => this.curTimeUnlimited = true}}),
                h('label', {props: {for: 'unlimited'}}, "Unlimited"),
            ]),
            h('div', [h('span', 'Color:')].concat(colors.map(makeRadioButton))),
            h('button', {
                on: {click: () => this.emit(this.curTimeUnlimited ?
                    new MakeSeek(this.curSeekColor, 
                        undefined, undefined, "") :
                    new MakeSeek(
                        this.curSeekColor,
                        this.curTime.white,
                        this.curTime.black,
                        ""
                    ))
                }
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