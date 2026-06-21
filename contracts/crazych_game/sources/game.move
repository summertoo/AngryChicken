#[allow(lint(self_transfer))]
module crazych_game::game {

    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::event;
    use std::string::{Self, String};

    // ─── Structs ───

    /// 皮肤 NFT：参数型，链上只存渲染参数，游戏实时绘制
    public struct ChickenSkin has key, store {
        id: UID,
        primary: u32,
        secondary: u32,
        pattern: u8,
        eye: u8,
        accessory: u8,
        rarity: u8,
        seed: u64,
        name: String,
        created_at: u64,
    }

    /// 盲盒批次
    public struct SkinBox has key {
        id: UID,
        price: u64,
        remaining: u64,
        rarities: vector<u8>,
    }

    /// 用户自创关卡
    public struct UserLevel has key, store {
        id: UID,
        creator: address,
        name: String,
        description: String,
        blob_id: String,
        price: u64,
        play_count: u64,
        rating_sum: u64,
        rating_count: u64,
        created_at: u64,
    }

    /// 关卡包购买凭证
    public struct LevelPackPass has key, store {
        id: UID,
        pack_id: u8,
        unlocked_at: u64,
    }

    // ─── Events ───

    public struct SkinPurchased has copy, drop {
        owner: address,
        skin_id: ID,
        rarity: u8,
    }

    public struct LevelPublished has copy, drop {
        creator: address,
        level_id: ID,
        blob_id: String,
        price: u64,
    }

    public struct LevelPackUnlocked has copy, drop {
        owner: address,
        pack_id: u8,
    }

    // ─── Admin & Treasury ───

    public struct AdminCap has key { id: UID }

    const BENEFICIARY: address = @0x73cc0ae26d786e8664ad129ecf9dd6df263fa57b198b0db5074780ce43e58bb9;

    /// 金库（收款地址固定不可改）
    public struct Treasury has key {
        id: UID,
        beneficiary: address,
    }

    fun init(ctx: &mut TxContext) {
        transfer::transfer(AdminCap { id: object::new(ctx) }, tx_context::sender(ctx));
    }

    /// 初始化金库（部署后由 Admin 调用一次，收款地址合约写死）
    public fun initialize_treasury(
        _cap: &AdminCap,
        ctx: &mut TxContext,
    ) {
        transfer::share_object(Treasury {
            id: object::new(ctx),
            beneficiary: BENEFICIARY,
        });
    }

    /// 查询金库受益人（view）
    public fun treasury_beneficiary(treasury: &Treasury): address {
        treasury.beneficiary
    }

    // ─── Skin Box ───

    public fun create_skin_box(
        _cap: &AdminCap,
        price: u64,
        remaining: u64,
        rarities: vector<u8>,
        ctx: &mut TxContext,
    ) {
        transfer::transfer(SkinBox {
            id: object::new(ctx), price, remaining, rarities,
        }, tx_context::sender(ctx));
    }

    /// v1（向后兼容）：费用退回付款人
    public fun open_skin_box(
        box: &mut SkinBox,
        payment: &mut Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        assert!(box.remaining > 0, 0);
        let payment_coin = coin::split(payment, box.price, ctx);
        transfer::public_transfer(payment_coin, tx_context::sender(ctx));
        let idx = (tx_context::epoch(ctx) as u64) % box.rarities.length();
        let rarity = box.rarities[idx];
        let seed = (tx_context::epoch(ctx) as u64) << 32 | (box.remaining as u64);
        box.remaining = box.remaining - 1;

        let skin = ChickenSkin {
            id: object::new(ctx),
            primary: rarity_to_primary(rarity),
            secondary: rarity_to_secondary(rarity),
            pattern: rarity,
            eye: rarity,
            accessory: if (rarity >= 3) { 4 } else { rarity },
            rarity,
            seed,
            name: string::utf8(b"Skin"),
            created_at: tx_context::epoch(ctx),
        };
        event::emit(SkinPurchased { owner: tx_context::sender(ctx), skin_id: object::id(&skin), rarity });
        transfer::transfer(skin, tx_context::sender(ctx));
    }

    /// v2（正式版）：费用进金库
    public fun open_skin_box_v2(
        box: &mut SkinBox,
        payment: &mut Coin<SUI>,
        treasury: &Treasury,
        ctx: &mut TxContext,
    ) {
        assert!(box.remaining > 0, 0);
        let payment_coin = coin::split(payment, box.price, ctx);
        transfer::public_transfer(payment_coin, treasury.beneficiary);
        let idx = (tx_context::epoch(ctx) as u64) % box.rarities.length();
        let rarity = box.rarities[idx];
        let seed = (tx_context::epoch(ctx) as u64) << 32 | (box.remaining as u64);
        box.remaining = box.remaining - 1;

        let skin = ChickenSkin {
            id: object::new(ctx),
            primary: rarity_to_primary(rarity),
            secondary: rarity_to_secondary(rarity),
            pattern: rarity,
            eye: rarity,
            accessory: if (rarity >= 3) { 4 } else { rarity },
            rarity,
            seed,
            name: string::utf8(b"Skin"),
            created_at: tx_context::epoch(ctx),
        };
        event::emit(SkinPurchased { owner: tx_context::sender(ctx), skin_id: object::id(&skin), rarity });
        transfer::transfer(skin, tx_context::sender(ctx));
    }

    // ─── Skin Crafting ───

    /// v1（向后兼容）：费用退回付款人
    public fun craft_skin(
        payment: &mut Coin<SUI>,
        primary: u32, secondary: u32, pattern: u8, eye: u8, accessory: u8,
        name: String,
        ctx: &mut TxContext,
    ) {
        let fee = coin::split(payment, 300_000_000, ctx);
        transfer::public_transfer(fee, tx_context::sender(ctx));
        let skin = ChickenSkin {
            id: object::new(ctx), primary, secondary, pattern, eye, accessory,
            rarity: 0, seed: tx_context::epoch(ctx) as u64, name,
            created_at: tx_context::epoch(ctx),
        };
        transfer::transfer(skin, tx_context::sender(ctx));
    }

    /// v2（正式版）：费用进金库
    public fun craft_skin_v2(
        payment: &mut Coin<SUI>,
        primary: u32, secondary: u32, pattern: u8, eye: u8, accessory: u8,
        name: String,
        treasury: &Treasury,
        ctx: &mut TxContext,
    ) {
        let fee = coin::split(payment, 300_000_000, ctx);
        transfer::public_transfer(fee, treasury.beneficiary);
        let skin = ChickenSkin {
            id: object::new(ctx), primary, secondary, pattern, eye, accessory,
            rarity: 0, seed: tx_context::epoch(ctx) as u64, name,
            created_at: tx_context::epoch(ctx),
        };
        transfer::transfer(skin, tx_context::sender(ctx));
    }

    // ─── Level ───

    public fun publish_level(
        name: String, description: String, blob_id: String, price: u64, ctx: &mut TxContext,
    ) {
        let level = UserLevel {
            id: object::new(ctx), creator: tx_context::sender(ctx),
            name, description, blob_id, price,
            play_count: 0, rating_sum: 0, rating_count: 0,
            created_at: tx_context::epoch(ctx),
        };
        event::emit(LevelPublished {
            creator: *&level.creator,
            level_id: object::id(&level),
            blob_id: *&level.blob_id,
            price: level.price,
        });
        transfer::transfer(level, tx_context::sender(ctx));
    }

    /// 购买关卡访问权：费用直接转给关卡创建者
    public fun purchase_level_access(
        level: &mut UserLevel, payment: &mut Coin<SUI>, ctx: &mut TxContext,
    ) {
        level.play_count = level.play_count + 1;
        transfer::public_transfer(coin::split(payment, level.price, ctx), level.creator);
    }

    // ─── Level Pack Pass ───

    /// v1（向后兼容，testnet）：费用退回付款人
    public fun purchase_pack_pass(
        payment: &mut Coin<SUI>, pack_id: u8, ctx: &mut TxContext,
    ) {
        let fee = coin::split(payment, 500_000_000, ctx);
        transfer::public_transfer(fee, tx_context::sender(ctx));
        let pass = LevelPackPass {
            id: object::new(ctx), pack_id, unlocked_at: tx_context::epoch(ctx),
        };
        event::emit(LevelPackUnlocked { owner: tx_context::sender(ctx), pack_id });
        transfer::transfer(pass, tx_context::sender(ctx));
    }

    /// v2（正式版）：费用进金库
    public fun purchase_pack_pass_v2(
        payment: &mut Coin<SUI>,
        pack_id: u8,
        treasury: &Treasury,
        ctx: &mut TxContext,
    ) {
        let fee = coin::split(payment, 500_000_000, ctx);
        transfer::public_transfer(fee, treasury.beneficiary);
        let pass = LevelPackPass {
            id: object::new(ctx), pack_id, unlocked_at: tx_context::epoch(ctx),
        };
        event::emit(LevelPackUnlocked { owner: tx_context::sender(ctx), pack_id });
        transfer::transfer(pass, tx_context::sender(ctx));
    }

    // ─── Rating ───

    public fun rate_level(level: &mut UserLevel, rating: u8) {
        assert!(rating >= 1 && rating <= 5, 0);
        level.rating_sum = level.rating_sum + (rating as u64);
        level.rating_count = level.rating_count + 1;
    }

    // ─── Helpers ───

    fun rarity_to_primary(rarity: u8): u32 {
        if (rarity == 0) { 0x00FF4500 }
        else if (rarity == 1) { 0x00FFD700 }
        else if (rarity == 2) { 0x00FF00FF }
        else { 0x0000FFFF }
    }

    fun rarity_to_secondary(rarity: u8): u32 {
        if (rarity == 0) { 0x00FF6347 }
        else if (rarity == 1) { 0x00FFA500 }
        else if (rarity == 2) { 0x00DA70D6 }
        else { 0x00E0FFFF }
    }

    // ─── Tests ───

    #[test]
    fun test_craft_skin() {
        use sui::test_scenario;
        let owner = @0xA;
        let mut scenario = test_scenario::begin(owner);
        { let ctx = test_scenario::ctx(&mut scenario); init(ctx); };
        {
            let ctx = test_scenario::ctx(&mut scenario);
            let mut payment = coin::mint_for_testing<SUI>(1_000_000_000, ctx);
            craft_skin(&mut payment, 0x00FF4500, 0x00FFD700, 1, 2, 0, string::utf8(b"Test"), ctx);
            coin::burn_for_testing(payment);
            test_scenario::next_tx(&mut scenario, owner);
        };
        let skin = test_scenario::take_from_sender<ChickenSkin>(&scenario);
        assert!(skin.pattern == 1, 0);
        test_scenario::return_to_sender(&scenario, skin);
        test_scenario::end(scenario);
    }

    #[test]
    fun test_publish_level() {
        use sui::test_scenario;
        let owner = @0xA;
        let mut scenario = test_scenario::begin(owner);
        { let ctx = test_scenario::ctx(&mut scenario); init(ctx); };
        {
            let ctx = test_scenario::ctx(&mut scenario);
            publish_level(string::utf8(b"Test Level"), string::utf8(b"A test"), string::utf8(b"blob_123"), 0, ctx);
            test_scenario::next_tx(&mut scenario, owner);
        };
        let level = test_scenario::take_from_sender<UserLevel>(&scenario);
        assert!(*&level.price == 0, 0);
        test_scenario::return_to_sender(&scenario, level);
        test_scenario::end(scenario);
    }

    #[test]
    fun test_purchase_pack_pass() {
        use sui::test_scenario;
        let owner = @0xA;
        let mut scenario = test_scenario::begin(owner);
        { let ctx = test_scenario::ctx(&mut scenario); init(ctx); };
        {
            let ctx = test_scenario::ctx(&mut scenario);
            let mut payment = coin::mint_for_testing<SUI>(1_000_000_000, ctx);
            purchase_pack_pass(&mut payment, 1, ctx);
            coin::burn_for_testing(payment);
            test_scenario::next_tx(&mut scenario, owner);
        };
        let pass = test_scenario::take_from_sender<LevelPackPass>(&scenario);
        assert!(*&pass.pack_id == 1, 0);
        test_scenario::return_to_sender(&scenario, pass);
        test_scenario::end(scenario);
    }
}
