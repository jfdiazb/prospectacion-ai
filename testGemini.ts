import "dotenv/config";
import { GeminiService } from "./services/GeminiService";

async function main() {

    const gemini = new GeminiService();

    const respuesta = await gemini.generateResponse(
        "Responde únicamente: Hola José Fernando"
    );

    console.log(respuesta);

}

main();