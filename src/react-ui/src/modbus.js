export const status_to_string = (s) => ({ 1: "Ok", 2: "CRC error", 3: "Invalid response", 4: "Timed out" }[s] || "Disconnected");
