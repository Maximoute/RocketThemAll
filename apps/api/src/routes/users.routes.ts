import { Router } from "express";
import { UsersService } from "@rta/services";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();
const usersService = new UsersService();

router.get("/", requireAdmin, async (_req, res) => {
  res.json(await usersService.listUsers());
});

router.get("/:id/inventory", async (req, res) => {
  res.json(await usersService.getUserInventory(req.params.id));
});

router.patch("/:id/inventory", requireAdmin, async (req, res) => {
  const { cardId, quantity } = req.body as { cardId: string; quantity: number };
  res.json(await usersService.patchInventory(req.params.id, cardId, quantity));
});

export default router;
