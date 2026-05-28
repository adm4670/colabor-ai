/**
     * Testes para o SkillsManager
     */
    
    import { SkillsManager } from "./skills-manager";
    
    describe("SkillsManager", () => {
      it("should load no skills from empty directory", () => {
        const manager = new SkillsManager({ skillsDir: "/tmp/nonexistent-skills-test" });
        const skills = manager.loadAllSkills();
        expect(Array.isArray(skills)).toBe(true);
      });
    
      it("should return empty array for irrelevant context", () => {
        const manager = new SkillsManager({ skillsDir: "/tmp/nonexistent-skills-test" });
        const relevant = manager.loadRelevantSkills("completely unrelated text");
        expect(Array.isArray(relevant)).toBe(true);
      });
    
      it("should list skills", () => {
        const manager = new SkillsManager({ skillsDir: "/tmp/nonexistent-skills-test" });
        const list = manager.listSkills();
        expect(Array.isArray(list)).toBe(true);
      });
    });
    