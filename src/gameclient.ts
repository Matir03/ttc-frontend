import Chessground from './chessground';
import { ReceivedGameState, Chat, Action, ChatAction,
    MakeMove, PerformMove, ChatEvent, TaggedAction, ClockInfo } from './commontypes';
import { Move } from './ttc/types';
import { attributesModule, classModule, eventListenersModule, h, 
    init, propsModule, styleModule, toVNode, VNode } from 'snabbdom';
import { Api } from './chessground/api';
import { Color, Key, MoveMetadata, Role, Piece } from './chessground/types';
import { PieceSelector } from './selection';
import { opposite, pieceToChar, charToPiece } from './chessground/util';
import { unselect } from './chessground/board';
import { Game } from './ttc/game';
import { toCoord, toKey } from './ttc/board';
import { timeStamp } from 'console';

interface UIElement {
    vnode: VNode;
    update: () => VNode;
}

const patch = init([
    attributesModule,
    classModule,
    propsModule,
    styleModule,
    eventListenersModule
]);    

const PROMOTABLE_ROLES: Role[] = ['queen', 'knight', 'rook', 'bishop'];
const NON_BISHOP_ROLES: Role[] = ['queen', 'knight', 'rook'];

function sameColor(key1: Key, key2: Key): boolean {
    const parity = (key: Key) => key.charCodeAt(0) + key.charCodeAt(1);
    return ((parity(key1) + parity(key2)) % 2) === 0;
}

function promote(cg: Api, key: Key, role: Role): void {
    cg.state.pieces.get(key).role = role;
}

function tap(cg: Api, orig: Key, dest: Key, role?: Role) {
    const piece = cg.state.pieces.get(dest);
    
    if(role) {
        cg.state.pieces.set(orig, {
            color: piece.color, role
        });
    } else {
        cg.state.pieces.set(orig, piece);
    }

    cg.state.pieces.set(dest, {
        color: piece.color,
        role: piece.role,
        tapped: {
            target: orig,
            role
        },
    });
    
    cg.set({
        selected: null,
        lastMove: [orig, dest],
    });

    cg.setAutoShapes([]);
    cg.endTurn();
}

function unblink(cg: Api, key: Key, piece: Piece) {
    const atk = cg.state.blinked.get(key);
    const p = pieceToChar(piece);
    const c = atk.get(p);
    atk.set(p, c - 1);

    cg.state.pieces.set(key, piece);

    cg.set({
        selected: null,
        lastMove: [key],
    });

    cg.setAutoShapes([]);
    cg.endTurn();
}

export class GameClient {

    pname: string;
    game: Game;
    emit: (action: Action) => void;

    cg: Api;
    cgNode: HTMLElement;

    sel: PieceSelector;
    selNode: VNode;
    selecting: boolean;

    spectating: boolean;
    flipped: boolean;
    color: Color;
    other: Color;

    oldLastMove: Key[];
    selected: Key;

    chat: Chat;
    chatUpdated: boolean;
    
    clockInfo: ClockInfo;
    clockInterval: NodeJS.Timer;

    status: string;
    drawOffered: boolean;

    ui: UIElement[];

    constructor(pname: string, 
        emit: (action: Action) => void) {
        
        this.pname = pname;
        
        this.emit = action => {
            switch(action.kind) {
                case "MakeMove":
                    this.drawOffered = false;

                    if(this.clockInfo[this.color]) {
                        const timestamp = Date.now();

                        this.clockInfo.timeleft.push(
                            this.clockInfo.timeleft.at(-2) +
                            this.clockInfo[this.color].incr -
                            (timestamp - this.clockInfo.timestamp));

                        this.clockInfo.timestamp = timestamp;
                    }

                    this.game.makeMove((action as MakeMove).move);

                    break;

                case "Decline Draw":
                    this.drawOffered = false;
                    break;

                case "Flip Board":
                    this.flipped = !this.flipped;
                    this.syncCg();
                    this.updateView();
                    return;
            }

            this.updateView();
            emit(action);
        }

        this.cgNode = document.createElement('div');
        this.cgNode.id = "chessground";

        this.cg = Chessground(this.cgNode, {
            addDimensionsCssVars: true,

            movable: {
                free: false,
                showDests: true,
                events: {
                    after: (orig, dest, blinks, meta) =>
                        this.afterMove(orig, dest, blinks, meta)
                }
            },

            premovable: {enabled: false},

            blinkable: {
                onBlink: (key) => {
                    this.updateView();
                },

                unblinker: (key) => {
                    const roles = [...new Set(this.cg.state.blinked.get(key))]
                        .filter(([p, n]) => n > 0 && 
                            charToPiece(p).color === this.color)
                        .map(([p, n]) => charToPiece(p).role);

                    if(roles.length === 0) return;

                    const blinks = this.cg.getBlinks().map(toKey);

                    if(!this.game.board.isLegal({
                        orig: toKey(key),
                        target: roles.at(0),
                        blinks 
                    })) return;
                    
                    this.sel.start(key, roles, this.color,
                        sr => {
                            const move = {
                                orig: toKey(key),
                                target: sr,
                                blinks: this.cg.getBlinks().map(toKey)
                            };
                            
                            unblink(this.cg, key, {
                                role: sr,
                                color: this.color
                            });

                            this.emit(new MakeMove(move));
                        },
                        () => {
                            this.selecting = false;
                        }
                    );
                }
            },

            events: {select: key => this.onSelect(key)},

            draggable: {showGhost: false},
        });

        this.selNode = toVNode(document.createElement('div'));

        this.sel = new PieceSelector(
            f => f(this.cg),
            () => this.drawSel()
        )
        
        this.selecting = false;

        this.chat = [];
        this.chatUpdated = false;

        this.status = 'waiting';
        this.drawOffered = false;

        this.clockInfo = undefined;
        this.clockInterval = undefined;

        this.ui = [
            {vnode: h('div'), update: () => this.blinkPanel('white')},
            {vnode: h('div'), update: () => this.blinkPanel('black')},
            {vnode: h('div'), update: () => this.clock('white')},
            {vnode: h('div'), update: () => this.clock('black')},
            {vnode: h('div'), update: () => this.movelist()},
            {vnode: h('div'), update: () => this.controls()},
            {vnode: h('div'), update: () => this.chatbox()},
        ];

    }

    drawSel() {
        this.selecting = true;
        this.cgNode.appendChild(this.selNode.elm);

        this.selNode = patch(this.selNode,
            this.sel.view() || h('div'));
    }

    afterMove(orig: Key, dest: Key, blinks: Key[], meta: MoveMetadata) {
        const move: Move = {
            orig: toKey(orig), 
            dest: toKey(dest), 
            blinks: blinks.map(toKey)
        };

        const piece = this.cg.state.pieces.get(dest);

        if(piece.role === 'pawn' && 
            this.game.board.enpassant === toKey(dest)[0] &&
            dest[1] === (this.color === 'white' ? '6' : '3')) {
            this.cg.state.pieces.delete(dest[0] + (this.color === 'white' ?
                '5' : '4') as Key);
        }
        
        if(piece.role === 'pawn' && (
            (dest[1] === '8' && 
            this.color === 'white') || 
            (dest[1] === '1' && 
            this.color == 'black')
        )) {
            this.sel.start(dest,
                piece.tapped ? [piece.tapped.role] : PROMOTABLE_ROLES,
                this.color,
                sr => {
                    move.target = sr;
                    promote(this.cg, dest, sr);
                    this.cg.endTurn();
                    this.emit(new MakeMove(move));
                },
                () => {
                    this.cg.state.pieces.set(orig, piece);
                    this.selecting = false;

                    if(meta.captured) {
                        this.cg.state.pieces.set(dest, meta.captured);
                    } else {
                        this.cg.state.pieces.delete(dest);
                    }

                    this.cg.state.lastMove = this.oldLastMove;
                    this.updateView();

                    this.cg.redrawAll();
                }
            );
        } else {
            this.cg.endTurn();
            this.emit(new MakeMove(move));
        }
    }

    onSelect(key: Key) {
        if(this.game.ply !== this.game.moves.length ||
            this.spectating ||
            this.cg.state.turnColor === this.other ||
            (this.cg.state.selected && !this.selected)) return;

        const piece = this.cg.state.pieces.get(key);

        if(!this.cg.state.selected) 
            this.selected = null;
        
        if(piece) {
            if(this.selected) {             
                
                const move: Move = {
                    orig: toKey(this.selected),
                    dest: toKey(key),
                    blinks: this.cg.getBlinks().map(toKey)
                }

                if(piece.role === 'pawn') {                                
                    if(!this.game.board.isLegal({
                        orig: move.orig,
                        dest: move.dest,
                        blinks: move.blinks,
                        target: 'queen'
                        })) return;

                    const psq = `${key[0]}${
                        this.color === 'white' ?
                        '8' : '1'}` as Key;
                    
                    const maybeBishop: Role[] = 
                        sameColor(this.selected, psq) ?
                        ['bishop'] : [];

                    const maybePawn: Role[] = 
                        key[0] === this.selected[0] &&
                        (this. color === 'white' ? 
                            key[1] < this.selected[1] :
                            key[1] > this.selected[1]) &&
                        this.selected[1] !== psq ?
                        ['pawn'] : [];

                    const orig = this.selected;

                    this.sel.start(this.selected,
                        NON_BISHOP_ROLES.concat(maybeBishop, maybePawn),
                        this.color,
                        sr => { 
                            move.target = sr;
                            
                            tap(this.cg, orig, key, sr);  
                            this.emit(new MakeMove(move));
                        },
                        () => {
                            this.selecting = false;
                            unselect(this.cg.state);
                            this.cg.redrawAll();
                        }
                    )
                } else { 
                    if(!this.game.board.isLegal(move))
                        return;
                    tap(this.cg, this.selected, key);   
                    this.emit(new MakeMove(move));
                }                     

                this.selected = null;
                this.cg.state.selected = null;
            } 
        } else {
            if(this.selected === key || 
                this.game.board.legalTaps(toKey(key), 
                    this.cg.getBlinks().map(toKey))
                    .length === 0) {
                this.selected = null;
                this.cg.state.selected = null;
            } else {
                this.selected = key;
                this.cg.state.selected = key;
            }

            this.cg.redrawAll();
        }
    }

    setDestsMap() {
        const blinks = this.cg.getBlinks().map(toKey);

        if(this.game.ply !== this.game.moves.length ||
            this.status !== 'playing') {
            this.cg.set({
                movable: {color: undefined}
            });

            return;
        }

        this.cg.set({
            movable: {
                color: this.spectating ? undefined : this.color,

                dests: coord =>  
                    (this.game.board.isEmpty(toKey(coord)) ?
                    this.game.board.legalTaps(toKey(coord), blinks) :
                    this.game.board.legalDests(toKey(coord), blinks)) 
                        .map(toCoord) as Key[]
            },
            blinkable: {
                keys: coord => 
                    this.game.board.canBlink(toKey(coord), blinks) 
            }
        });
    }

    setState(state: ReceivedGameState) {
        if(this.pname === state.white ||
            this.pname === state.black) {
            this.spectating = false;

            this.color = state.white === this.pname?
                "white" : "black";

            this.other = opposite(this.color);
            
            this.flipped = this.color === 'black';
        } else {
            this.spectating = true;
            this.color = null;
            this.other = null;
            this.flipped = false;
        }

        this.game = new Game(state.game);

        this.chat = state.chat;
        this.chatUpdated = true;

        this.clockInfo = state.clockInfo;

        this.drawOffered = state.drawOffer === this.pname;

        this.status = state.ended ? 
            "ended" : "playing";

        this.syncCg();
    }

    jumpTo(ply: number) {
        if(ply < 0 || ply > this.game.moves.length) return;

        this.game.gotoPly(ply);

        this.syncCg();

        this.updateView();
    }

    syncCg() {
        this.cg.set({
            fen: "8/8/8/8/8/8/8/8",
            orientation: this.flipped ? "black" : "white",
            turnColor: this.game.board.turn,
            movable: {
                color: this.spectating ? undefined : this.color,
            }
        });

        this.game.board.squares.forEach((sq, coord) => {
            this.cg.state.blinked.set(coord as Key, new Map(sq.blinks));

            if(sq.piece)
                this.cg.state.pieces.set(coord as Key, {
                    role: sq.piece.role, 
                    color: sq.piece.color,
                    tapped: sq.piece.tapped ? {
                        target: toCoord(sq.piece.tapped.target) as Key,
                        role: sq.piece.tapped.role
                    } : null,
                });
        });

        const lastMove = this.game.ply ?
            this.game.moves.at(this.game.ply - 1) : 
            null;

        if(lastMove) {
            this.cg.state.lastMove = [toCoord(lastMove.orig) as Key];

            if(lastMove.dest) 
                this.cg.state.lastMove.push(toCoord(lastMove.dest) as Key);
        } else {
            this.cg.state.lastMove = undefined;
        }
        
        this.cg.redrawAll();
    }

    update(event: Action) {
        console.log(`Receiving game event ${JSON.stringify(event)}`);

        switch(event.kind) {
            case "PerformMove":
                const color = (event as PerformMove).color;
                const move = (event as PerformMove).move;
                const timestamp = (event as PerformMove).timestamp;

                if(this.clockInfo[color]) {
                    if(color === this.color) {
                        this.clockInfo.timeleft[-1] += 
                            this.clockInfo.timestamp - timestamp;
                    } else {
                        this.clockInfo.timeleft.push(
                            this.clockInfo.timeleft.at(-2) +
                            this.clockInfo[color].incr -
                            (timestamp - this.clockInfo.timestamp));
                    }
                    
                    this.clockInfo.timestamp = timestamp;
                }

                if(color === this.color) return;

                this.jumpTo(this.game.ply);

                if(!this.game.makeMove(move)) {
                    console.log("Illegal move!");
                    return;
                }

                this.oldLastMove = [toCoord(move.orig) as Key].concat(
                    move.dest ? toCoord(move.dest) as Key : []);
                
                move.blinks.forEach(key => 
                    this.cg.state.pieces.get(toCoord(key) as Key).blinking = true
                )

                if(!move.dest) {
                    unblink(this.cg, toCoord(move.orig) as Key, {
                        role: move.target,
                        color: this.other
                    });
                } else if(this.cg.state.pieces.has(toCoord(move.orig) as Key)) {
                    this.cg.move(toCoord(move.orig) as Key, toCoord(move.dest) as Key);
                    
                    if(move.target) {
                        promote(this.cg, toCoord(move.dest) as Key, move.target);
                    }

                    this.cg.endTurn();
                } else {
                    tap(this.cg, toCoord(move.orig) as Key, 
                        toCoord(move.dest) as Key, move.target);
                }
            
                break;

            case "ChatEvent":
                const msg = (event as ChatEvent).message;

                this.chat.push(msg);
                this.chatUpdated = true;

                break;

            case "GameEnd":
                this.status = "ended";
                break;

            case "DrawOffered":
                if((event as TaggedAction).player === this.pname) return;
                
                this.drawOffered = true;
                break;

            default: 
                console.log("Unknown event type: " + event.kind);
        }

        this.syncCg();
        this.updateView();
    }

    blinkPanel (color: Color): VNode {
        const wakeUp = () => {
            this.cgNode.classList.remove('dream');
            this.syncCg();      
            this.cg.redrawAll();        
            if(this.selecting) this.drawSel();
        };

        const pieceTag = (role: Role) => {
            const blinks = [...this.game.board.blinks
                .get(pieceToChar({role, color}))];
            
            const count = blinks
                .map(([s, n]) => n)
                .reduce((m, n) => m + n, 0);
            
            return h('div.blink-wrap', [h('piece', {
                class: {
                    [color] : true,
                    [role] : true,
                    "active": !!count
                }, 
                attrs: {
                    "data-nb": count,
                },
                on: count ? {
                    mouseenter: () => {
                        this.cgNode.classList.add('dream');

                        this.cg.state.lastMove = [];
                        this.cg.state.pieces.clear();
                        
                        blinks.forEach(([k, quantity]) => 
                            this.cg.state.pieces.set(
                                k as Key, {
                                    role, color, quantity
                                }
                            )
                        )
                        
                        this.cg.redrawAll();
                    },
                    mouseleave: () => wakeUp()
                } : {}
            })])
        }

        return h('div', {class: {
            ['blink'] : true,
            [`blink-${color}`] : true, 
            [`blink-top`] : this.flipped ? 
                color === 'white' : 
                color === 'black',
            [`blink-bot`] : this.flipped ? 
                color === 'black' : 
                color === 'white',
        }}, ['pawn', 'knight', 'bishop', 'rook', 'queen']
            .map(pieceTag)
        )
    }

    clock(color: Color): VNode {
        if(!this.clockInfo[color]) return h('div');

        const ply = this.game.ply;
        const turnColor = this.game.board.turn;
        const lastPly = ply + (turnColor === color ? 0 : 1);

        let clockTime = this.clockInfo.timeleft[lastPly];

        if(ply === this.game.moves.length 
            && turnColor === color
            && this.status !== "ended") {
            clockTime -= Date.now() - this.clockInfo.timestamp;
        }

        if(clockTime < 0) clockTime = 0;

        const low = clockTime < Math.max(20000,
            this.clockInfo[color].base * 0.1 -
            this.clockInfo[color].incr * 10);

        if(!this.clockInterval && this.status === "playing") {
            this.clockInterval = setInterval(() => {
                this.ui[2].vnode = 
                    patch(this.ui[2].vnode, this.ui[2].update());
                this.ui[3].vnode = 
                    patch(this.ui[3].vnode, this.ui[3].update());
            }, 50);
        }

        if(this.status === "ended") {
            clearInterval(this.clockInterval);
            this.clockInterval = null;
        }

        const hrs = Math.floor(clockTime / 3600000);
        const mins = Math.floor((clockTime % 3600000) / 60000);
        const secs = Math.floor((clockTime % 60000) / 1000);
        const ms = Math.floor((clockTime % 1000) / 100);
        const active = this.status === "playing" &&
            ply === this.game.moves.length &&
            turnColor === color;
        const blink = !low && active && ms < 5; 

        return h('div', {class: {
            ['clock'] : true,
            [`clock-${color}`] : true,
            ['clock-top'] : this.flipped ?
                color === 'white' :
                color === 'black',
            ['clock-bot'] : this.flipped ?
                color === 'black' :
                color === 'white',
        }}, [h('div.clock-wrap', {class: {
            'active': active,
            'midstep': blink,
            'low': low
        }}, (hrs ? [
                h('span', hrs),
                h('span.colon', ':'),
            ] : []).concat([
                h('span', hrs ? 
                    mins.toString().padStart(2, '0') : 
                    mins),
                h('span.colon', ':'),
                h('span', secs.toString().padStart(2, '0')),
            ], low ? [
                h('span', '.'),
                h('span', ms)
            ] : [])
        )]);
    }

    movelist() {
        return h('div#movelist', {
            hook: {
                postpatch: () => {
                    document.querySelector('#movelist .chosen')
                        ?.scrollIntoView({block: 'nearest'});
                }
            }
        }, [
            h('table', this.game.moves_plain.filter((_, i) => i % 2 === 0)
                .map((move, i) => h('tr', [
                    h('td.movenum', i + 1 + '.'),
                    h('td.move', {
                        class: {chosen: i*2 + 1 === this.game.ply},
                        on: {click: () => this.jumpTo(i*2 + 1)}
                    }, move),
                    h('td.move', {
                        class: {chosen: i*2 + 2 === this.game.ply},
                        on: {click: () => this.jumpTo(i*2 + 2)}
                    },
                        this.game.moves_plain[i*2 + 1] ?? '')
                ]))
            )
        ]);
    }

    controls() {
        let botLeft: string,
            botRight: string;

        if(this.spectating) {
            botLeft = 'Flip Board';
            botRight = 'Leave Game';
        } else if(this.status === 'ended') {
            botLeft = 'Exit Game';
            botRight = 'Rematch';  
        } else {
            if(this.drawOffered) {
                botLeft = 'Accept Draw';
                botRight = 'Decline Draw';
            } else {
                botLeft = this.game.canClaimDraw() ? 
                    'Claim Draw' : 'Offer Draw';
                botRight = 'Resign';
            }
        }

        return h('div#controls', [
            h('button.toprow', {
                on: {click: () => this.jumpTo(0)}
            }, '<<'),
            h('button.toprow', {
                on: {click: () => this.jumpTo(this.game.ply - 1)}
            }, '<'),
            h('button.toprow', {
                on: {click: () => this.jumpTo(this.game.ply + 1)}
            }, '>'),
            h('button.toprow', {
                on: {click: () => this.jumpTo(this.game.moves.length)}
            }, '>>'),
            h('button.botrow', {
                on: {click: () => this.emit({kind: botLeft})}
            }, botLeft),
            h('button.botrow', {
                on: {click: () => this.emit({kind: botRight})}
            }, botRight)
        ])
    }

    chatbox() {
        const scroll = () => {
            if(!this.chatUpdated) return;
            this.chatUpdated = false;
            const box = document.getElementById('chat-box');
            box.scrollTop = box.scrollHeight;
        }

        return h('div#chat', {
            hook: {
                postpatch: () => scroll()
            }
        }, [
            h('div#chat-box', this.chat.map(msg => 
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

    updateView() {
        this.setDestsMap();
        
        this.ui.forEach(({vnode, update}, i) => 
            this.ui[i].vnode = patch(vnode, update()))
    }

    view(): VNode { 
        document.onkeydown = (e: KeyboardEvent) => {
            if(e.key === "ArrowUp") {
                e.preventDefault();
                this.jumpTo(0);
            } else if(e.key === "ArrowLeft") {
                e.preventDefault();
                this.jumpTo(this.game.ply - 1);
            } else if(e.key === "ArrowRight") {
                e.preventDefault();
                this.jumpTo(this.game.ply + 1);
            } else if(e.key === "ArrowDown") {
                e.preventDefault();
                this.jumpTo(this.game.moves.length);
            }
        }

        
        
        return h('div#root.game', {
            hook: {
                insert: (vnode) => {
                    vnode.elm.appendChild(this.cgNode);
                    this.updateView();
                }
            },
           
        }, this.ui.map(elm => elm.vnode = elm.update()));
    }
}