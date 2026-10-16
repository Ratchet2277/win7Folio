FROM node:20-alpine
WORKDIR /app
COPY shared/ ./shared/
COPY documents/server.mjs ./documents/server.mjs
ENV DOCUMENTS_ROOT=/documents
EXPOSE 3000
USER node
CMD ["node", "documents/server.mjs"]
