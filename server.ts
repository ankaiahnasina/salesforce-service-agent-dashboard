import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Mock Salesforce Data for Demo
  let mockCases = [
    {
      id: "5001I000001ABC",
      subject: "Engine Overheating - Model X",
      priority: "High",
      status: "New",
      description: "Customer reports engine overheating after 20 minutes of driving. Warning light is on.",
      customerName: "John Doe",
      vehicleId: "VIN123456789",
      sentiment: "Critical"
    }
  ];

  let mockVehicleHistory = {
    "VIN123456789": [
      { date: "2024-01-10", service: "Oil Change", notes: "Standard maintenance" },
      { date: "2023-06-15", service: "Coolant Flush", notes: "Flushed and refilled coolant" }
    ]
  };

  // API Routes
  app.get("/api/cases", (req, res) => {
    res.json(mockCases);
  });

  app.get("/api/vehicle-history/:vin", (req, res) => {
    const vin = req.params.vin;
    res.json(mockVehicleHistory[vin as keyof typeof mockVehicleHistory] || []);
  });

  app.post("/api/cases/:id/update", (req, res) => {
    const { id } = req.params;
    const { summary, status } = req.body;
    const caseIndex = mockCases.findIndex(c => c.id === id);
    if (caseIndex !== -1) {
      mockCases[caseIndex] = { ...mockCases[caseIndex], status, description: mockCases[caseIndex].description + "\n\n[Technical Summary]: " + summary };
      res.json({ success: true, updatedCase: mockCases[caseIndex] });
    } else {
      res.status(404).json({ error: "Case not found" });
    }
  });

  // OAuth Mock URL
  app.get("/api/auth/url", (req, res) => {
    const redirectUri = `${process.env.APP_URL}/auth/callback`;
    const authUrl = `https://login.salesforce.com/services/oauth2/authorize?response_type=code&client_id=MOCK_CLIENT_ID&redirect_uri=${encodeURIComponent(redirectUri)}&scope=api`;
    res.json({ url: authUrl });
  });

  // OAuth Callback Handler
  app.get("/auth/callback", (req, res) => {
    res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f4f4f4;">
          <div style="background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center;">
            <h2 style="color: #2e7d32;">Authentication Successful!</h2>
            <p>Salesforce account connected. This window will close automatically.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                setTimeout(() => window.close(), 2000);
              } else {
                window.location.href = '/';
              }
            </script>
          </div>
        </body>
      </html>
    `);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
