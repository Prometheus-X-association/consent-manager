import { Router } from "express";
import User from "../models/User/User.model";
import { OAUTH_SCOPES } from "../libs/OAuth/scopes";
import {
  generateAccessToken,
  generateRefreshToken,
  validateScopes,
} from "../libs/OAuth/tokens";
const r: Router = Router();

r.get("/authorize", async (req, res) => {
  if (!req.session.user) {
    return res.redirect("/users/login");
  }

  // Parse the requested scopes from the OAuth client
  const requestedScopes = req.query.scope?.toString()?.split(" ") || [];

  // Render the consent page
  res.render("consent", {
    clientName: req.query.client_name,
    requestedScopes: requestedScopes.map(
      (scope: keyof typeof OAUTH_SCOPES) => ({
        name: scope,
        description: OAUTH_SCOPES[scope] || "Unknown scope",
      })
    ),
  });
});

r.post("/token", async (req, res) => {
  if (req.body.code !== req.session.authorizationCode)
    return res.status(400).json({ error: "Invalid authorization code" });

  const user = await User.findById(req.session.user.id);

  if (!user) return res.status(400).json({ error: "User not found" });

  const requestedScopes = req.body.scope.split(" ");
  const validScopes = validateScopes(requestedScopes);

  if (!validScopes) {
    return res.status(400).json({ error: "Invalid or unauthorized scope(s)" });
  }

  const accessToken = generateAccessToken(user, validScopes);
  const refreshToken = await generateRefreshToken(user);

  const response: any = {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
  };

  if (refreshToken) {
    response.refresh_token = refreshToken;
  }

  res.json(response);
});

export default r;
