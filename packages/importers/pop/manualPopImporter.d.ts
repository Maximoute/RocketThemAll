export interface ManualPopCard {
    name: string;
    category: string;
    imageUrl?: string;
    description?: string;
    rarity: string;
    source?: string;
}
export declare function importManualPopCulture(dataFilePath?: string): Promise<number>;
