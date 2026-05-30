/**
     * Tests for Auth Routes
     */
    import jwt from "jsonwebtoken";
    
    // Use a known secret for testing
    const JWT_SECRET = "test-secret-key-12345";
    
    describe("Auth - JWT Token Logic", () => {
      describe("Token Generation", () => {
        it("should generate a valid JWT token", () => {
          const payload = { userId: "user_1", sessionId: "session_abc" };
          const token = jwt.sign(payload, JWT_SECRET, { expiresIn: 86400 });
    
          expect(token).toBeDefined();
          expect(typeof token).toBe("string");
          expect(token.split(".")).toHaveLength(3); // header.payload.signature
        });
    
        it("should decode to the correct payload", () => {
          const payload = { userId: "user_test", sessionId: "session_xyz" };
          const token = jwt.sign(payload, JWT_SECRET, { expiresIn: 86400 });
    
          const decoded = jwt.verify(token, JWT_SECRET) as any;
          expect(decoded.userId).toBe("user_test");
          expect(decoded.sessionId).toBe("session_xyz");
        });
    
        it("should reject tokens signed with wrong secret", () => {
          const payload = { userId: "user_1", sessionId: "s1" };
          const token = jwt.sign(payload, JWT_SECRET, { expiresIn: 86400 });
    
          expect(() => {
            jwt.verify(token, "wrong-secret");
          }).toThrow();
        });
      });
    
      describe("Token Verification", () => {
        it("should verify a valid token", () => {
          const token = jwt.sign({ userId: "u1", sessionId: "s1" }, JWT_SECRET, { expiresIn: 86400 });
          const decoded = jwt.verify(token, JWT_SECRET) as any;
          expect(decoded.userId).toBe("u1");
        });
    
        it("should reject expired tokens", () => {
          const token = jwt.sign(
            { userId: "u1", sessionId: "s1" },
            JWT_SECRET,
            { expiresIn: 0 } // expires immediately
          );
    
          // Wait a tiny bit and then verify
          expect(() => {
            jwt.verify(token, JWT_SECRET);
          }).toThrow();
        });
    
        it("should reject malformed tokens", () => {
          expect(() => {
            jwt.verify("not.a.token", JWT_SECRET);
          }).toThrow();
    
          expect(() => {
            jwt.verify("", JWT_SECRET);
          }).toThrow();
        });
      });
    
      describe("Token Refresh", () => {
        it("should generate a new token with same payload", () => {
          const original = jwt.sign(
            { userId: "u1", sessionId: "s1" },
            JWT_SECRET,
            { expiresIn: 86400 }
          );
    
          // Decode original
          const decoded = jwt.verify(original, JWT_SECRET) as any;
    
          // Create refreshed token
          const refreshed = jwt.sign(
            { userId: decoded.userId, sessionId: decoded.sessionId },
            JWT_SECRET,
            { expiresIn: 86400 }
          );
    
          const decodedRefreshed = jwt.verify(refreshed, JWT_SECRET) as any;
          expect(decodedRefreshed.userId).toBe(decoded.userId);
          expect(decodedRefreshed.sessionId).toBe(decoded.sessionId);
        });
      });
    
      describe("Edge Cases", () => {
        it("should handle special characters in userId", () => {
          const payload = { userId: "user@domain.com", sessionId: "session-123_abc" };
          const token = jwt.sign(payload, JWT_SECRET, { expiresIn: 86400 });
          const decoded = jwt.verify(token, JWT_SECRET) as any;
          expect(decoded.userId).toBe("user@domain.com");
        });
    
        it("should handle empty sessionId", () => {
          const payload = { userId: "u1", sessionId: "" };
          const token = jwt.sign(payload, JWT_SECRET, { expiresIn: 86400 });
          const decoded = jwt.verify(token, JWT_SECRET) as any;
          expect(decoded.sessionId).toBe("");
        });
      });
    });
    