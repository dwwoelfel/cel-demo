const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
  const m = createProxyMiddleware({
    target: "http://127.0.0.1:8089",
    øchangeOrigin: true,
  });
  app.use("/test", m);
};
