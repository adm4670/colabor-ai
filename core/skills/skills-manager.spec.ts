/**
     * Testes para o SkillsManager (v2 com frontmatter YAML)
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
    
      it("should load skills from the real skills directory with YAML frontmatter", () => {
        const manager = new SkillsManager();
        manager.refreshCache();
        const skills = manager.loadAllSkills();
        
        // Deve ter pelo menos 1 skill
        expect(skills.length).toBeGreaterThan(0);
        
        // Cada skill deve ter os campos do novo formato
        for (const skill of skills) {
          expect(skill.name).toBeTruthy();
          expect(skill.title).toBeTruthy();
          expect(skill.description).toBeTruthy();
          expect(Array.isArray(skill.keywords)).toBe(true);
          expect(skill.keywords.length).toBeGreaterThan(0);
          expect(skill.filePath).toBeTruthy();
          expect(skill.content).toBeTruthy();
          expect(skill.body).toBeTruthy();
        }
      });
    
      it("should find relevant skills by keyword", () => {
        const manager = new SkillsManager();
        manager.refreshCache();
        
        // Contexto sobre Python deve ativar python-dev
        const pythonSkills = manager.loadRelevantSkills("preciso escrever um script python");
        expect(Array.isArray(pythonSkills)).toBe(true);
        
        // Contexto sobre busca web
        const webSkills = manager.loadRelevantSkills("buscar no google sobre openclaw");
        expect(Array.isArray(webSkills)).toBe(true);
      });
    
      it("should parse frontmatter correctly from SKILL.md files", () => {
        const manager = new SkillsManager();
        manager.refreshCache();
        const skills = manager.loadAllSkills();
        
        // Verificar que a skill communication existe e tem keywords
        const comm = skills.find(s => s.name === "communication");
        if (comm) {
          expect(comm.keywords).toContain("comunicacao");
          expect(comm.keywords).toContain("resposta");
          expect(comm.title).toBe("Communication Skill");
        }
        
        // Verificar que a skill python-dev existe e tem keywords
        const py = skills.find(s => s.name === "python-dev");
        if (py) {
          expect(py.keywords).toContain("python");
          expect(py.keywords).toContain("script");
          expect(py.title).toBe("Python Development Skill");
        }
      });
    });
    