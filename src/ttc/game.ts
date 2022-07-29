import * as ttc from './types';
import { Board } from './board';

export const startingFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - - 0 1";

export class Game {

    board: Board;
    ply: number;
    fens: string[];
    moves: ttc.Move[];
    moves_plain: string[];

    constructor(moves: ttc.Move[] = []) {
        this.moves = [];
        this.moves_plain = [];
        this.fens = [startingFEN];
        this.board = Board.fromFEN(startingFEN);
        this.ply = 0;

        moves.forEach(move => this.makeMove(move));
    }

    makeMove(move: ttc.Move): boolean {
        if(!this.board.isLegal(move)) 
            return false;

        this.moves_plain.push(this.board.moveToString(move));
        this.board.makeMove(move);

        this.moves.splice(this.ply);
        this.fens.splice(this.ply + 1);
        
        this.ply += 1;
        this.moves.push(move);
        this.fens.push(this.board.toFEN());

        return true;
    }

    gotoPly(newPly: number) {
        this.board = Board.fromFEN(this.fens[newPly]);
        this.ply = newPly;
    }

    toJSON() {
        return this.moves;
    }
}