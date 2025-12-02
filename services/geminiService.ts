import { GoogleGenAI, Type } from "@google/genai";
import { GameState, Unit, Direction, UnitType, AIAction, SupportLine } from "../types";
import { GRID_SIZE, isValidMove, getValidAttackTargets } from "./gameLogic";

const getAI = () => {
    if (!process.env.API_KEY) {
        console.error("API_KEY is missing");
        return null;
    }
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// Convert numeric direction to string for the prompt
const dirToString = (d: Direction) => ['NORTH', 'EAST', 'SOUTH', 'WEST'][d];

export const getComputerMoves = async (gameState: GameState): Promise<AIAction[]> => {
  const ai = getAI();
  if (!ai) {
      // Fallback fallback simple logic if no API key
      console.warn("No API Key. Returning empty turn.");
      return [{ unitId: 'fallback', actionType: 'end_turn' }];
  }

  const myUnits = gameState.units.filter(u => u.player === 'computer');
  const enemyUnits = gameState.units.filter(u => u.player === 'player');

  // Serialize Board State
  const unitsJson = gameState.units.map(u => ({
    id: u.id,
    type: u.type,
    player: u.player,
    pos: { x: u.x, y: u.y },
    rotation: dirToString(u.rotation),
    stats: { moves: u.movesLeft, attacks: u.attacksLeft }
  }));

  const supportsJson = gameState.computerSupport.map(s => `${s.type.toUpperCase()} ${s.index}`);

  const systemInstruction = `
    You are an AI playing a tactical board game "Strategia 7x7" (now on 8x8 board).
    Grid: 0,0 (Top Left) to 7,7 (Bottom Right).
    You are the 'computer' player (Top side usually). Enemy is 'player'.
    
    Rules:
    - Eliminate enemy units.
    - Units: Infantry (Move 1, Atk 1), Archer (Ranged, Move 1), Cavalry (Move 2, Atk 1).
    - Support Tokens: Provide +1 Strength to specific Row/Col. Your supports: ${JSON.stringify(supportsJson)}.
    - Flanking gives +1 combat strength.
    - Archers die instantly if attacked in melee.
    
    Goal:
    Analyze the board. Return a JSON array of actions to execute in sequence.
    You can move multiple units.
    Valid actions:
    { "unitId": "id", "actionType": "move", "target": {"x": number, "y": number} }
    { "unitId": "id", "actionType": "rotate", "direction": 0|1|2|3 } (0:N, 1:E, 2:S, 3:W)
    { "unitId": "id", "actionType": "attack", "target": {"x": number, "y": number} }
    
    Always end with { "unitId": "global", "actionType": "end_turn" }.
    Be aggressive but tactical. Protect your archers. Flank when possible.
  `;

  const prompt = `
    Current Game State:
    Units: ${JSON.stringify(unitsJson)}
    
    Generate the winning move sequence.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    unitId: { type: Type.STRING },
                    actionType: { type: Type.STRING, enum: ['move', 'rotate', 'attack', 'end_turn'] },
                    target: { 
                        type: Type.OBJECT, 
                        properties: { x: {type: Type.NUMBER}, y: {type: Type.NUMBER} } 
                    },
                    direction: { type: Type.INTEGER }
                },
                required: ['unitId', 'actionType']
            }
        }
      }
    });

    const text = response.text;
    if (!text) return [{ unitId: 'err', actionType: 'end_turn' }];
    
    return JSON.parse(text) as AIAction[];

  } catch (error) {
    console.error("Gemini AI Error:", error);
    return [{ unitId: 'err', actionType: 'end_turn' }];
  }
};