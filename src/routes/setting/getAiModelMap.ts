import express from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";

const router = express.Router();

export default router.post("/", async (req, res) => {
  const configData = await u
    .db("t_aiModelMap")
    .leftJoin("t_config", "t_aiModelMap.configId", "t_config.id")
    .select(
      "t_aiModelMap.id",
      "t_aiModelMap.configId",
      "t_aiModelMap.name",
      "t_aiModelMap.key",
      "t_aiModelMap.defaultManufacturer",
      "t_aiModelMap.defaultModel",
      "t_config.model as configModel",
      "t_config.type as configType",
      "t_config.modelType as configModelType",
      "t_config.apiKey as configApiKey",
      "t_config.baseUrl as configBaseUrl",
      "t_config.manufacturer as configManufacturer",
    );
  res.status(200).send(success(configData));
});
