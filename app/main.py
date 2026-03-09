
    from fastapi import FastAPI, HTTPException
    from pydantic import BaseModel
    from typing import Optional
    
    app = FastAPI()
    
    # Modelo para usuário
    class User(BaseModel):
        username: str
        email: str
    
    @app.get("/")
    async def read_root():
        return {"message": "Welcome to the API!"}
    
    @app.get("/greet/{name}")
    async def greet(name: str):
        return {"message": f"Hello, {name}!"}
    
    @app.get("/items/{item_id}")
    async def read_item(item_id: int, q: Optional[str] = None):
        return {"item_id": item_id, "query": q}
    
    @app.post("/users/")
    async def create_user(user: User):
        return user
    